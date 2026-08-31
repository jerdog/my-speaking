import { Form, Link, useNavigation } from "react-router";

import type { Route } from "./+types/talk";
import { BusyButton } from "~/components/Busy";
import {
  SiteFooter,
  SiteHeader,
  SPEAKER_NAME,
} from "~/components/SiteChrome";
import { SlideViewer } from "~/components/SlideViewer";
import { env } from "cloudflare:workers";
import { optionalAdmin, requireAdmin } from "~/lib/access.server";
import { getTalkBySlug, setTalkPublished } from "~/lib/db";
import { formatEventDate } from "~/lib/format";
import { slideUrl, sourcePdfUrl } from "~/lib/r2";

export function meta({ loaderData }: Route.MetaArgs) {
  if (!loaderData) return [{ title: "Talk not found" }];

  const { talk, slideUrls } = loaderData;
  const description = talk.abstract ?? `${talk.title} — ${talk.conferenceName}`;

  return [
    { title: `${talk.title} — ${SPEAKER_NAME}` },
    { name: "description", content: description },
    { property: "og:title", content: talk.title },
    { property: "og:description", content: description },
    { property: "og:type", content: "article" },
    // The title slide makes a natural share image.
    ...(slideUrls[0]
      ? [
          { property: "og:image", content: slideUrls[0] },
          { name: "twitter:card", content: "summary_large_image" },
        ]
      : []),
  ];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const talk = await getTalkBySlug(env.DB, params.slug);
  if (!talk) throw new Response("Not Found", { status: 404 });

  // An unpublished talk is a private preview: visible to the admin so it can be
  // checked before going live, a plain 404 to anyone else. Anonymous visitors
  // carry no Access cookie, so this costs them nothing.
  const isAdmin = (await optionalAdmin(request)) !== null;
  if (!talk.published && !isAdmin) {
    throw new Response("Not Found", { status: 404 });
  }

  return {
    talk,
    isAdmin,
    slideUrls: Array.from({ length: talk.slideCount }, (_, i) =>
      slideUrl(env.SLIDES_CDN_URL, talk.id, talk.slidesVersion, i + 1),
    ),
    pdfUrl: sourcePdfUrl(env.SLIDES_CDN_URL, talk.id, talk.slidesVersion),
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  await requireAdmin(request);

  const talk = await getTalkBySlug(env.DB, params.slug);
  if (!talk) throw new Response("Not Found", { status: 404 });

  const intent = String((await request.formData()).get("intent") ?? "");
  if (intent !== "publish" && intent !== "unpublish") {
    return { error: "Unknown action" };
  }
  if (intent === "publish" && talk.slideCount === 0) {
    return { error: "Add slides before publishing." };
  }

  await setTalkPublished(env.DB, talk.id, intent === "publish");
  return { error: null };
}

export default function TalkPage({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { talk, isAdmin, slideUrls, pdfUrl } = loaderData;
  const navigation = useNavigation();
  const pendingIntent = navigation.formData?.get("intent");

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-6 pb-16">
        {isAdmin && !talk.published && (
          <div className="mt-6 flex flex-col gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                Draft — only you can see this
              </p>
              <p className="text-sm text-[var(--muted)]">
                {talk.slideCount > 0
                  ? "This is exactly how it will look once published."
                  : "No slides yet — add a deck before publishing."}
              </p>
              {actionData?.error && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                  {actionData.error}
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Link
                to={`/admin/talks/${talk.id}/edit`}
                className="rounded-full border border-[var(--border)] px-4 py-1.5 text-sm hover:bg-[var(--surface)]"
              >
                Edit
              </Link>
              <Form method="post">
                <input type="hidden" name="intent" value="publish" />
                <BusyButton
                  type="submit"
                  busy={pendingIntent === "publish"}
                  busyLabel="Publishing…"
                  disabled={talk.slideCount === 0}
                  className="rounded-full bg-[var(--accent)] px-4 py-1.5 text-sm font-medium text-[var(--accent-fg)]"
                >
                  Publish
                </BusyButton>
              </Form>
            </div>
          </div>
        )}

        {isAdmin && talk.published && (
          <div className="mt-6 flex items-center justify-between rounded-xl border border-[var(--border)] px-4 py-2 text-sm">
            <span className="text-[var(--muted)]">Published</span>
            <div className="flex items-center gap-4">
              <Link
                to={`/admin/talks/${talk.id}/edit`}
                className="text-[var(--muted)] underline-offset-4 hover:text-[var(--fg)] hover:underline"
              >
                Edit
              </Link>
              <Form method="post">
                <input type="hidden" name="intent" value="unpublish" />
                <BusyButton
                  type="submit"
                  busy={pendingIntent === "unpublish"}
                  busyLabel="Unpublishing…"
                  className="text-[var(--muted)] underline-offset-4 hover:text-[var(--fg)] hover:underline"
                >
                  Unpublish
                </BusyButton>
              </Form>
            </div>
          </div>
        )}

        <header className="py-10 sm:py-14">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm text-[var(--muted)] transition-colors hover:text-[var(--fg)]"
          >
            <span aria-hidden="true">←</span> All talks
          </Link>
          <h1 className="mt-6 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
            {talk.title}
          </h1>
          <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-[var(--muted)]">
            {talk.conferenceUrl ? (
              <a
                href={talk.conferenceUrl}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-[var(--brand)] underline-offset-4 hover:underline"
              >
                {talk.conferenceName}
              </a>
            ) : (
              <span className="font-medium text-[var(--fg)]">
                {talk.conferenceName}
              </span>
            )}
            <span aria-hidden="true">·</span>
            <time dateTime={talk.eventDate}>
              {formatEventDate(talk.eventDate)}
            </time>
            {talk.location && (
              <>
                <span aria-hidden="true">·</span>
                <span>{talk.location}</span>
              </>
            )}
          </p>
        </header>

        <SlideViewer slideUrls={slideUrls} title={talk.title} />

        <div className="mt-6 flex flex-wrap gap-3">
          {pdfUrl && talk.slideCount > 0 && (
            <a
              href={pdfUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-fg)] transition-opacity hover:opacity-90"
            >
              Download slides (PDF)
            </a>
          )}
          {talk.videoUrl && (
            <a
              href={talk.videoUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] px-4 py-2 text-sm font-medium transition-colors hover:bg-[var(--surface)]"
            >
              Watch the recording
            </a>
          )}
        </div>

        {talk.abstract && (
          <section className="mt-14 max-w-2xl">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.15em] text-[var(--muted)]">
              About this talk
            </h2>
            <div className="whitespace-pre-line text-lg leading-relaxed">
              {talk.abstract}
            </div>
          </section>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
