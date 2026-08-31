import { Form, Link, useNavigation } from "react-router";

import type { Route } from "./+types/talk";
import { BusyButton } from "~/components/Busy";
import { SlideViewer } from "~/components/SlideViewer";
import { env } from "cloudflare:workers";
import { optionalAdmin, requireAdmin } from "~/lib/access.server";
import { getTalkBySlug, setTalkPublished } from "~/lib/db";
import { formatEventDate } from "~/lib/format";
import { slideUrl, sourcePdfUrl } from "~/lib/r2";

export function meta({ loaderData }: Route.MetaArgs) {
  if (!loaderData) return [{ title: "Talk not found" }];
  return [
    { title: `${loaderData.talk.title} — Jeremy Meiss` },
    {
      name: "description",
      content: loaderData.talk.abstract ?? loaderData.talk.title,
    },
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
    <main className="mx-auto max-w-4xl px-4 py-12">
      {isAdmin && !talk.published && (
        <div className="mb-6 flex flex-col gap-3 rounded-lg border border-amber-900/60 bg-amber-950/20 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-amber-400">
              Draft — only you can see this
            </p>
            <p className="text-sm text-neutral-400">
              {talk.slideCount > 0
                ? "This is exactly how it will look once published."
                : "No slides yet — add a deck before publishing."}
            </p>
            {actionData?.error && (
              <p className="mt-1 text-sm text-red-400">{actionData.error}</p>
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            <Link
              to={`/admin/talks/${talk.id}/edit`}
              className="rounded border border-neutral-700 px-3 py-1.5 text-sm hover:border-neutral-500"
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
                className="rounded bg-white px-3 py-1.5 text-sm font-medium text-black hover:bg-neutral-200"
              >
                Publish
              </BusyButton>
            </Form>
          </div>
        </div>
      )}

      {isAdmin && talk.published && (
        <div className="mb-6 flex items-center justify-between rounded-lg border border-neutral-800 px-4 py-2 text-sm">
          <span className="text-neutral-500">Published</span>
          <div className="flex gap-2">
            <Link
              to={`/admin/talks/${talk.id}/edit`}
              className="text-neutral-400 underline hover:text-neutral-200"
            >
              Edit
            </Link>
            <Form method="post">
              <input type="hidden" name="intent" value="unpublish" />
              <BusyButton
                type="submit"
                busy={pendingIntent === "unpublish"}
                busyLabel="Unpublishing…"
                className="text-neutral-400 underline hover:text-neutral-200"
              >
                Unpublish
              </BusyButton>
            </Form>
          </div>
        </div>
      )}

      <Link to="/" className="text-sm text-neutral-400 hover:text-neutral-200">
        ← All talks
      </Link>

      <header className="mb-8 mt-4">
        <h1 className="text-3xl font-bold tracking-tight">{talk.title}</h1>
        <p className="mt-2 text-neutral-400">
          {talk.conferenceUrl ? (
            <a
              href={talk.conferenceUrl}
              className="underline hover:text-neutral-200"
              target="_blank"
              rel="noreferrer"
            >
              {talk.conferenceName}
            </a>
          ) : (
            talk.conferenceName
          )}{" "}
          · {formatEventDate(talk.eventDate)}
          {talk.location ? ` · ${talk.location}` : ""}
        </p>
      </header>

      <SlideViewer slideUrls={slideUrls} title={talk.title} />

      {pdfUrl && (
        <p className="mt-4">
          <a
            href={pdfUrl}
            className="text-sm text-neutral-400 underline hover:text-neutral-200"
          >
            Download slides (PDF)
          </a>
        </p>
      )}

      {talk.abstract && (
        <section className="mt-10">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-neutral-500">
            Abstract
          </h2>
          <p className="whitespace-pre-line text-neutral-200">{talk.abstract}</p>
        </section>
      )}

      {talk.videoUrl && (
        <section className="mt-10">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-neutral-500">
            Video
          </h2>
          <a
            href={talk.videoUrl}
            className="text-neutral-200 underline"
            target="_blank"
            rel="noreferrer"
          >
            Watch the recording
          </a>
        </section>
      )}
    </main>
  );
}
