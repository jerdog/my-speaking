import { useState } from "react";
import {
  Form,
  Link,
  redirect,
  useNavigation,
  useRevalidator,
} from "react-router";

import { BusyButton } from "~/components/Busy";

import type { Route } from "./+types/admin.index";
import { requireAdmin } from "~/lib/access.server";
import { env } from "cloudflare:workers";
import { insertTalk, listAllTalks, slugify, uniqueSlug } from "~/lib/db";
import { formatEventDate } from "~/lib/format";
import { fetchNotistPresentations } from "~/lib/notist.server";
import {
  draftTalkFromEvent,
  fetchSessionizeEvents,
  splitSessionizeEvents,
  type SessionizeEvent,
} from "~/lib/sessionize.server";
import { importDeckFromUrl } from "~/lib/upload-talk.client";

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);

  const url = new URL(request.url);
  const talks = await listAllTalks(env.DB);

  let sessionize: {
    upcoming: SessionizeEvent[];
    needsSlides: SessionizeEvent[];
    error: string | null;
  } = { upcoming: [], needsSlides: [], error: null };

  if (env.SESSIONIZE_SPEAKER_ID) {
    try {
      const events = await fetchSessionizeEvents(env.SESSIONIZE_SPEAKER_ID);
      const today = new Date().toISOString().slice(0, 10);
      sessionize = { ...splitSessionizeEvents(events, talks, today), error: null };
    } catch (error) {
      sessionize.error =
        error instanceof Error ? error.message : "Failed to load Sessionize";
    }
  }

  // Drafts imported from Noti.st whose deck hasn't been rendered yet. The
  // rendering has to happen in a browser, so it's driven from the page.
  const pendingDecks = talks
    .filter((talk) => talk.notistDownloadUrl && talk.slideCount === 0)
    .map((talk) => ({
      id: talk.id,
      title: talk.title,
      uploadVersion: talk.slidesVersion + 1,
    }));

  // The Noti.st list is keyed off the URL rather than an action result, so it
  // survives an import instead of vanishing and needing a fresh lookup.
  const notistUrl = url.searchParams.get("notist")?.trim() ?? "";
  let notist: {
    url: string;
    found: NotistPreviewItem[];
    error: string | null;
  } | null = null;

  if (notistUrl) {
    const importedByNotistId = new Map(
      talks
        .filter((talk) => talk.notistId)
        .map((talk) => [talk.notistId as string, talk]),
    );
    try {
      const presentations = await fetchNotistPresentations(notistUrl, {
        skipDetailFor: new Set(importedByNotistId.keys()),
      });
      notist = {
        url: notistUrl,
        error: null,
        found: presentations.map((p) => ({
          id: p.id,
          title: p.title,
          conferenceName: p.conferenceName,
          eventDate: p.eventDate,
          hasDeck: p.downloadUrl !== null,
          importedSlug: importedByNotistId.get(p.id)?.slug ?? null,
        })),
      };
    } catch (error) {
      notist = {
        url: notistUrl,
        found: [],
        error: error instanceof Error ? error.message : "Noti.st unavailable",
      };
    }
  }

  const imported = Number(url.searchParams.get("imported"));
  const skippedNoDate = Number(url.searchParams.get("skipped"));

  return {
    talks,
    sessionize,
    pendingDecks,
    notist,
    lastImport: Number.isInteger(imported)
      ? { imported, skippedNoDate: skippedNoDate || 0 }
      : null,
  };
}

interface ActionResult {
  imported?: number;
  error?: string | null;
}

export interface NotistPreviewItem {
  id: string;
  title: string;
  conferenceName: string | null;
  eventDate: string | null;
  hasDeck: boolean;
  /** Slug of the local talk once imported, for jumping straight to it. */
  importedSlug: string | null;
}

export async function action({
  request,
}: Route.ActionArgs): Promise<ActionResult | Response> {
  await requireAdmin(request);

  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "sessionize");

  if (intent === "notist-import") return notistImport(formData);
  return sessionizeImport(formData);
}

/**
 * Imports Sessionize events as draft talks. The event list is re-fetched here
 * rather than taken from the form, so the browser only ever names which events
 * to import, never their contents.
 */
async function sessionizeImport(formData: FormData): Promise<ActionResult> {
  const eventId = String(formData.get("eventId") ?? "");
  if (!eventId) return { imported: 0, error: "No event specified" };

  if (!env.SESSIONIZE_SPEAKER_ID) {
    return { imported: 0, error: "SESSIONIZE_SPEAKER_ID is not set" };
  }

  let events;
  try {
    events = await fetchSessionizeEvents(env.SESSIONIZE_SPEAKER_ID);
  } catch (error) {
    return {
      imported: 0,
      error: error instanceof Error ? error.message : "Sessionize unavailable",
    };
  }

  const talks = await listAllTalks(env.DB);
  const today = new Date().toISOString().slice(0, 10);
  const { needsSlides } = splitSessionizeEvents(events, talks, today);

  const toImport =
    eventId === "all"
      ? needsSlides
      : needsSlides.filter((event) => event.id === eventId);

  for (const event of toImport) {
    const draft = draftTalkFromEvent(event);
    const id = crypto.randomUUID();
    await insertTalk(env.DB, {
      id,
      slug: await uniqueSlug(env.DB, slugify(draft.title) || id),
      ...draft,
    });
  }

  return { imported: toImport.length, error: null };
}

/**
 * Creates drafts from a Noti.st profile or presentation page. Only the deck URL
 * is recorded here; the PDF itself is pulled per talk afterwards to stay well
 * inside the Worker's subrequest budget on a large backlog.
 */
async function notistImport(formData: FormData) {
  const url = String(formData.get("notistUrl") ?? "").trim();
  if (!url) return { error: "Paste a Noti.st URL first" };

  let presentations;
  try {
    presentations = await fetchNotistPresentations(url);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Noti.st unavailable",
    };
  }

  const existing = await listAllTalks(env.DB);
  const importedIds = new Set(
    existing.map((talk) => talk.notistId).filter(Boolean),
  );

  const only = String(formData.get("notistId") ?? "");
  const requested = presentations.filter(
    (p) => !importedIds.has(p.id) && (only === "all" || p.id === only),
  );
  // A talk needs a date, so anything still missing one is reported rather than
  // dropped silently.
  const toImport = requested.filter((p) => p.eventDate !== null);
  const skippedNoDate = requested.length - toImport.length;

  for (const presentation of toImport) {
    const id = crypto.randomUUID();
    await insertTalk(env.DB, {
      id,
      slug: await uniqueSlug(
        env.DB,
        presentation.slug || slugify(presentation.title) || id,
      ),
      title: presentation.title,
      conferenceName: presentation.conferenceName ?? presentation.title,
      conferenceUrl: presentation.conferenceUrl,
      location: presentation.location,
      eventDate: presentation.eventDate!,
      abstract: presentation.abstract,
      videoUrl: null,
      sessionizeEventId: null,
      notistId: presentation.id,
      notistDownloadUrl: presentation.downloadUrl,
    });
  }

  // Back to the same list, so it's still there for the next import.
  const back = new URLSearchParams({
    notist: url,
    imported: String(toImport.length),
  });
  if (skippedNoDate) back.set("skipped", String(skippedNoDate));
  return redirect(`/admin?${back}`);
}

function NotistPanel({
  notist,
}: {
  notist: {
    url: string;
    found: NotistPreviewItem[];
    error: string | null;
  } | null;
}) {
  const revalidator = useRevalidator();
  const navigation = useNavigation();
  const found = notist && !notist.error ? notist.found : null;
  const url = notist?.url ?? "";

  // The lookup is a GET navigation towards a ?notist= URL. An import is a POST
  // that redirects to the same place, so the method is what separates them.
  const method = navigation.formMethod?.toUpperCase();
  const lookingUp =
    navigation.state !== "idle" &&
    (method === undefined || method === "GET") &&
    (navigation.location?.search.includes("notist=") ?? false);
  const importingId = navigation.formData?.get("notistId");

  // Only talks with a date can be imported, so don't offer a count that
  // promises more than the import will actually create.
  const importable = found?.filter((p) => !p.importedSlug && p.eventDate) ?? [];
  const undated = found?.filter((p) => !p.importedSlug && !p.eventDate) ?? [];

  return (
    <section className="rounded-lg border border-[var(--border)] p-4">
      <h2 className="mb-1 text-sm font-semibold text-[var(--fg)]">
        Import from Noti.st
      </h2>
      <p className="mb-4 text-sm text-[var(--muted)]">
        Paste your Noti.st profile URL to list everything on it, or a single
        presentation URL. Importing brings across the title, abstract,
        conference, date and location, and remembers where the deck lives. The
        list stays put, so you can work through it one at a time.
      </p>

      {/* A GET so the list lives in the URL and survives each import. */}
      <Form method="get" className="flex flex-col gap-2 sm:flex-row">
        <input
          type="url"
          name="notist"
          defaultValue={url}
          placeholder="https://noti.st/yourname"
          className="w-full rounded border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[var(--fg)] outline-none focus:border-[var(--muted)]"
        />
        <BusyButton
          type="submit"
          busy={lookingUp}
          busyLabel="Looking up…"
          className="shrink-0 rounded border border-[var(--border)] px-3 py-2 text-sm hover:border-[var(--muted)]"
        >
          Look up
        </BusyButton>
      </Form>

      {lookingUp && (
        <p className="mt-3 text-sm text-[var(--muted)]">
          Reading your Noti.st profile. A large one takes a moment — each
          presentation's event and deck are read from its own page.
        </p>
      )}

      {notist?.error && (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400">{notist.error}</p>
      )}

      {found && (
        <div className="mt-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-[var(--muted)]">
              Found {found.length} presentation{found.length === 1 ? "" : "s"},{" "}
              {importable.length} ready to import
              {undated.length > 0 ? `, ${undated.length} with no date` : ""}.{" "}
              <button
                type="button"
                onClick={() => revalidator.revalidate()}
                disabled={revalidator.state !== "idle"}
                className="underline hover:text-[var(--fg)] disabled:opacity-50"
              >
                {revalidator.state === "idle" ? "Refresh" : "Refreshing…"}
              </button>
            </p>
            {importable.length > 0 && (
              <Form method="post">
                <input type="hidden" name="intent" value="notist-import" />
                <input type="hidden" name="notistUrl" value={url} />
                <input type="hidden" name="notistId" value="all" />
                <BusyButton
                  type="submit"
                  busy={importingId === "all"}
                  busyLabel={`Importing ${importable.length}…`}
                  className="rounded bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-[var(--accent-fg)] hover:opacity-90"
                >
                  Import all ({importable.length})
                </BusyButton>
              </Form>
            )}
          </div>
          <ul className="max-h-80 divide-y divide-[var(--border)] overflow-y-auto border-y border-[var(--border)]">
            {found.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate">{p.title}</p>
                  {/* Imported rows aren't re-fetched from Noti.st, so showing
                      its fields here would read as missing data. */}
                  <p className="text-xs text-[var(--muted)]">
                    {p.importedSlug ? (
                      "already imported"
                    ) : (
                      <>
                        {p.conferenceName ?? "no event"}
                        {p.eventDate ? ` · ${p.eventDate}` : " · no date"}
                        {p.hasDeck ? "" : " · no deck"}
                      </>
                    )}
                  </p>
                </div>
                {p.importedSlug ? (
                  <Link
                    to={`/talks/${p.importedSlug}`}
                    className="shrink-0 text-xs text-[var(--muted)] underline hover:text-[var(--fg)]"
                  >
                    Preview
                  </Link>
                ) : !p.eventDate ? (
                  <span className="shrink-0 text-xs text-[var(--muted)]">
                    needs a date
                  </span>
                ) : (
                  <Form method="post" className="shrink-0">
                    <input type="hidden" name="intent" value="notist-import" />
                    <input type="hidden" name="notistUrl" value={url} />
                    <input type="hidden" name="notistId" value={p.id} />
                    <BusyButton
                      type="submit"
                      busy={importingId === p.id}
                      busyLabel="Importing…"
                      className="rounded border border-[var(--border)] px-2 py-1 text-xs hover:border-[var(--muted)]"
                    >
                      Import
                    </BusyButton>
                  </Form>
                )}
              </li>
            ))}
          </ul>
          {found.some((p) => !p.eventDate) && (
            <p className="mt-2 text-xs text-[var(--muted)]">
              Presentations with no event date are skipped — a talk needs a date.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function PendingDecks({
  pending,
}: {
  pending: { id: string; title: string; uploadVersion: number }[];
}) {
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [failures, setFailures] = useState<string[]>([]);
  const revalidator = useRevalidator();

  async function renderAll() {
    setRunning(true);
    setFailures([]);
    const failed: string[] = [];

    for (const [index, talk] of pending.entries()) {
      try {
        await importDeckFromUrl(
          { talkId: talk.id, uploadVersion: talk.uploadVersion },
          (progress) =>
            setStatus(
              `${index + 1}/${pending.length} · ${talk.title} · ${progress.step}` +
                (progress.total ? ` ${progress.done}/${progress.total}` : ""),
            ),
        );
      } catch (error) {
        failed.push(
          `${talk.title}: ${error instanceof Error ? error.message : "failed"}`,
        );
      }
    }

    setStatus(null);
    setFailures(failed);
    setRunning(false);
    revalidator.revalidate();
  }

  return (
    <section className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
      <h2 className="mb-1 text-sm font-semibold text-amber-600 dark:text-amber-400">
        {pending.length} deck{pending.length === 1 ? "" : "s"} ready to render
      </h2>
      <p className="mb-3 text-sm text-[var(--muted)]">
        Imported talks whose slides haven't been built yet. Rendering happens in
        this browser, so leave the tab open — each deck is fetched, converted to
        images and published as it finishes.
      </p>
      <button
        type="button"
        onClick={renderAll}
        disabled={running}
        className="rounded bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-[var(--accent-fg)] hover:opacity-90 disabled:opacity-50"
      >
        {running ? "Rendering…" : "Render all decks"}
      </button>
      {status && <p className="mt-2 text-sm text-[var(--muted)]">{status}</p>}
      {failures.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm text-red-600 dark:text-red-400">
          {failures.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function AdminDashboard({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { talks, sessionize, pendingDecks, notist, lastImport } = loaderData;
  const navigation = useNavigation();
  const importingEventId = navigation.formData?.get("eventId");

  return (
    <div className="space-y-12">
      {actionData?.error && (
        <p className="text-sm text-red-600 dark:text-red-400">Import failed: {actionData.error}</p>
      )}
      {actionData?.imported !== undefined && !actionData.error && (
        <p className="text-sm text-green-600 dark:text-green-400">
          Imported {actionData.imported} talk
          {actionData.imported === 1 ? "" : "s"} as drafts.
        </p>
      )}
      {lastImport && (
        <p className="text-sm text-green-600 dark:text-green-400">
          Imported {lastImport.imported} talk
          {lastImport.imported === 1 ? "" : "s"} as drafts.
          {lastImport.skippedNoDate ? (
            <span className="text-amber-600 dark:text-amber-400">
              {" "}
              Skipped {lastImport.skippedNoDate} with no event date.
            </span>
          ) : null}
        </p>
      )}

      {pendingDecks.length > 0 && <PendingDecks pending={pendingDecks} />}

      <NotistPanel notist={notist} />

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Talks</h1>
        <Link
          to="/admin/talks/new"
          className="rounded bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-[var(--accent-fg)] hover:opacity-90"
        >
          Add talk
        </Link>
      </div>

      {sessionize.needsSlides.length > 0 && (
        <section>
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-amber-600 dark:text-amber-400">
              Needs slides
            </h2>
            <Form method="post">
              <input type="hidden" name="eventId" value="all" />
              <BusyButton
                type="submit"
                busy={importingEventId === "all"}
                busyLabel="Importing…"
                className="rounded border border-[var(--border)] px-3 py-1.5 text-sm hover:border-[var(--muted)]"
              >
                Import all ({sessionize.needsSlides.length})
              </BusyButton>
            </Form>
          </div>
          <p className="mb-4 text-sm text-[var(--muted)]">
            These events have already happened per Sessionize, but have no talk
            here yet. Importing creates a draft with the conference, date and
            location filled in — add the title, abstract and slides afterwards.
          </p>
          <ul className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
            {sessionize.needsSlides.map((event) => (
              <li
                key={event.id}
                className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium">{event.name}</p>
                  <p className="text-sm text-[var(--muted)]">
                    {formatEventDate(event.startDate)}
                    {event.location ? ` · ${event.location}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Form method="post">
                    <input type="hidden" name="eventId" value={event.id} />
                    <BusyButton
                      type="submit"
                      busy={importingEventId === event.id}
                      busyLabel="Importing…"
                      className="rounded border border-[var(--border)] px-3 py-1.5 text-sm hover:border-[var(--muted)]"
                    >
                      Import
                    </BusyButton>
                  </Form>
                  <Link
                    to={`/admin/talks/new?${newTalkParams(event)}`}
                    className="rounded border border-[var(--border)] px-3 py-1.5 text-sm hover:border-[var(--muted)]"
                  >
                    Add slides
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {sessionize.upcoming.length > 0 && (
        <section>
          <h2 className="mb-4 text-sm font-semibold text-[var(--muted)]">
            Upcoming on Sessionize
          </h2>
          <ul className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
            {sessionize.upcoming.map((event) => (
              <li key={event.id} className="flex justify-between py-3 text-sm">
                <span>{event.name}</span>
                <span className="text-[var(--muted)]">
                  {formatEventDate(event.startDate)}
                  {event.location ? ` · ${event.location}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {sessionize.error && (
        <p className="text-sm text-[var(--muted)]">
          Sessionize unavailable: {sessionize.error}
        </p>
      )}

      <section>
        {talks.length === 0 ? (
          <p className="text-[var(--muted)]">No talks yet.</p>
        ) : (
          <ul className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
            {talks.map((talk) => (
              <li
                key={talk.id}
                className="flex items-center justify-between py-3"
              >
                <div>
                  <p className="font-medium">{talk.title}</p>
                  <p className="text-sm text-[var(--muted)]">
                    {talk.conferenceName} · {formatEventDate(talk.eventDate)} ·{" "}
                    {talk.slideCount} slides
                    {talk.published ? (
                      ""
                    ) : (
                      <span className="text-amber-600 dark:text-amber-400">
                        {" · draft — needs slides"}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3 text-sm">
                  <Link
                    to={`/talks/${talk.slug}`}
                    className="text-[var(--muted)] underline hover:text-[var(--fg)]"
                  >
                    {talk.published ? "View" : "Preview"}
                  </Link>
                  <Link
                    to={`/admin/talks/${talk.id}/edit`}
                    className="text-[var(--muted)] underline hover:text-[var(--fg)]"
                  >
                    Edit
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function newTalkParams(event: SessionizeEvent): string {
  const params = new URLSearchParams({
    conferenceName: event.name,
    eventDate: event.startDate,
    sessionizeEventId: event.id,
  });
  if (event.location) params.set("location", event.location);
  if (event.website) params.set("conferenceUrl", event.website);
  return params.toString();
}
