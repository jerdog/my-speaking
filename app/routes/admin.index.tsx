import { Form, Link } from "react-router";

import type { Route } from "./+types/admin.index";
import { requireAdmin } from "~/lib/access.server";
import { env } from "cloudflare:workers";
import { insertTalk, listAllTalks, slugify, uniqueSlug } from "~/lib/db";
import { formatEventDate } from "~/lib/format";
import {
  draftTalkFromEvent,
  fetchSessionizeEvents,
  splitSessionizeEvents,
  type SessionizeEvent,
} from "~/lib/sessionize.server";

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);

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

  return { talks, sessionize };
}

/**
 * Imports Sessionize events as draft talks. The event list is re-fetched here
 * rather than taken from the form, so the browser only ever names which events
 * to import, never their contents.
 */
export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);

  const formData = await request.formData();
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

export default function AdminDashboard({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { talks, sessionize } = loaderData;

  return (
    <div className="space-y-12">
      {actionData?.error && (
        <p className="text-sm text-red-400">Import failed: {actionData.error}</p>
      )}
      {actionData && !actionData.error && (
        <p className="text-sm text-green-400">
          Imported {actionData.imported} talk
          {actionData.imported === 1 ? "" : "s"} as drafts.
        </p>
      )}

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Talks</h1>
        <Link
          to="/admin/talks/new"
          className="rounded bg-white px-3 py-1.5 text-sm font-medium text-black hover:bg-neutral-200"
        >
          Add talk
        </Link>
      </div>

      {sessionize.needsSlides.length > 0 && (
        <section>
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-amber-400">
              Needs slides
            </h2>
            <Form method="post">
              <input type="hidden" name="eventId" value="all" />
              <button
                type="submit"
                className="rounded border border-neutral-700 px-3 py-1.5 text-sm hover:border-neutral-500"
              >
                Import all ({sessionize.needsSlides.length})
              </button>
            </Form>
          </div>
          <p className="mb-4 text-sm text-neutral-500">
            These events have already happened per Sessionize, but have no talk
            here yet. Importing creates a draft with the conference, date and
            location filled in — add the title, abstract and slides afterwards.
          </p>
          <ul className="divide-y divide-neutral-800 border-y border-neutral-800">
            {sessionize.needsSlides.map((event) => (
              <li
                key={event.id}
                className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium">{event.name}</p>
                  <p className="text-sm text-neutral-500">
                    {formatEventDate(event.startDate)}
                    {event.location ? ` · ${event.location}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Form method="post">
                    <input type="hidden" name="eventId" value={event.id} />
                    <button
                      type="submit"
                      className="rounded border border-neutral-700 px-3 py-1.5 text-sm hover:border-neutral-500"
                    >
                      Import
                    </button>
                  </Form>
                  <Link
                    to={`/admin/talks/new?${newTalkParams(event)}`}
                    className="rounded border border-neutral-700 px-3 py-1.5 text-sm hover:border-neutral-500"
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
          <h2 className="mb-4 text-sm font-semibold text-neutral-400">
            Upcoming on Sessionize
          </h2>
          <ul className="divide-y divide-neutral-800 border-y border-neutral-800">
            {sessionize.upcoming.map((event) => (
              <li key={event.id} className="flex justify-between py-3 text-sm">
                <span>{event.name}</span>
                <span className="text-neutral-500">
                  {formatEventDate(event.startDate)}
                  {event.location ? ` · ${event.location}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {sessionize.error && (
        <p className="text-sm text-neutral-500">
          Sessionize unavailable: {sessionize.error}
        </p>
      )}

      <section>
        {talks.length === 0 ? (
          <p className="text-neutral-500">No talks yet.</p>
        ) : (
          <ul className="divide-y divide-neutral-800 border-y border-neutral-800">
            {talks.map((talk) => (
              <li
                key={talk.id}
                className="flex items-center justify-between py-3"
              >
                <div>
                  <p className="font-medium">{talk.title}</p>
                  <p className="text-sm text-neutral-500">
                    {talk.conferenceName} · {formatEventDate(talk.eventDate)} ·{" "}
                    {talk.slideCount} slides
                    {talk.published ? (
                      ""
                    ) : (
                      <span className="text-amber-400">
                        {" · draft — needs slides"}
                      </span>
                    )}
                  </p>
                </div>
                <Link
                  to={`/admin/talks/${talk.id}/edit`}
                  className="text-sm text-neutral-400 underline hover:text-neutral-200"
                >
                  Edit
                </Link>
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
