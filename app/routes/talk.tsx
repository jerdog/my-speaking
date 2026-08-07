import { Link } from "react-router";

import type { Route } from "./+types/talk";
import { SlideViewer } from "~/components/SlideViewer";
import { env } from "cloudflare:workers";
import { getTalkBySlug } from "~/lib/db";
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

export async function loader({ context, params }: Route.LoaderArgs) {
  const talk = await getTalkBySlug(env.DB, params.slug);

  if (!talk || !talk.published) {
    throw new Response("Not Found", { status: 404 });
  }

  return {
    talk,
    slideUrls: Array.from({ length: talk.slideCount }, (_, i) =>
      slideUrl(env.SLIDES_CDN_URL, talk.id, talk.slidesVersion, i + 1),
    ),
    pdfUrl: sourcePdfUrl(env.SLIDES_CDN_URL, talk.id, talk.slidesVersion),
  };
}

export default function TalkPage({ loaderData }: Route.ComponentProps) {
  const { talk, slideUrls, pdfUrl } = loaderData;

  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
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
