import { Link } from "react-router";

import type { Route } from "./+types/home";
import { env } from "cloudflare:workers";
import { listPublishedTalks } from "~/lib/db";
import { formatEventDate } from "~/lib/format";
import { slideUrl } from "~/lib/r2";

export function meta() {
  return [
    { title: "Speaking — Jeremy Meiss" },
    {
      name: "description",
      content: "Conference talks and slide decks by Jeremy Meiss.",
    },
  ];
}

export async function loader({ context }: Route.LoaderArgs) {
  const talks = await listPublishedTalks(env.DB);
  const [featured, ...past] = talks;

  return {
    featured: featured
      ? {
          ...featured,
          coverUrl:
            featured.slideCount > 0
              ? slideUrl(env.SLIDES_CDN_URL, featured.id, featured.slidesVersion, 1)
              : null,
        }
      : null,
    past,
  };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { featured, past } = loaderData;

  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
      <header className="mb-12">
        <h1 className="text-4xl font-bold tracking-tight">Speaking</h1>
        <p className="mt-2 text-neutral-400">
          Conference talks and slide decks by Jeremy Meiss.
        </p>
      </header>

      {featured ? (
        <section className="mb-16">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-neutral-500">
            Most recent talk
          </h2>
          <Link
            to={`/talks/${featured.slug}`}
            className="group block overflow-hidden rounded-xl border border-neutral-800 transition-colors hover:border-neutral-600"
          >
            {featured.coverUrl && (
              <img
                src={featured.coverUrl}
                alt={`Title slide for ${featured.title}`}
                className="aspect-video w-full bg-neutral-900 object-contain"
              />
            )}
            <div className="p-6">
              <h3 className="text-2xl font-semibold group-hover:underline">
                {featured.title}
              </h3>
              <p className="mt-1 text-neutral-400">
                {featured.conferenceName} · {formatEventDate(featured.eventDate)}
                {featured.location ? ` · ${featured.location}` : ""}
              </p>
              {featured.abstract && (
                <p className="mt-3 line-clamp-3 text-neutral-300">
                  {featured.abstract}
                </p>
              )}
            </div>
          </Link>
        </section>
      ) : (
        <p className="mb-16 text-neutral-500">No talks published yet.</p>
      )}

      {past.length > 0 && (
        <section>
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-neutral-500">
            Past talks
          </h2>
          <ul className="divide-y divide-neutral-800 border-y border-neutral-800">
            {past.map((talk) => (
              <li key={talk.id}>
                <Link
                  to={`/talks/${talk.slug}`}
                  className="group flex flex-col gap-1 py-4 sm:flex-row sm:items-baseline sm:justify-between"
                >
                  <span className="font-medium group-hover:underline">
                    {talk.title}
                  </span>
                  <span className="shrink-0 text-sm text-neutral-400">
                    {talk.conferenceName} · {formatEventDate(talk.eventDate)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
