import { Link } from "react-router";
import { env } from "cloudflare:workers";

import type { Route } from "./+types/home";
import {
  SiteFooter,
  SiteHeader,
  SPEAKER_NAME,
  SPEAKER_TAGLINE,
} from "~/components/SiteChrome";
import { listPublishedTalks, type Talk } from "~/lib/db";
import { formatEventDate } from "~/lib/format";
import { slideUrl } from "~/lib/r2";

export function meta() {
  return [
    { title: `Speaking — ${SPEAKER_NAME}` },
    { name: "description", content: SPEAKER_TAGLINE },
  ];
}

function withCover(talk: Talk) {
  return {
    ...talk,
    coverUrl:
      talk.slideCount > 0
        ? slideUrl(env.SLIDES_CDN_URL, talk.id, talk.slidesVersion, 1)
        : null,
  };
}

export async function loader() {
  const talks = await listPublishedTalks(env.DB);
  const [featured, ...past] = talks;

  return {
    featured: featured ? withCover(featured) : null,
    past: past.map(withCover),
    stats: {
      talks: talks.length,
      conferences: new Set(talks.map((t) => t.conferenceName)).size,
      // Talks come back newest first, so the last one is the earliest.
      since: talks.at(-1)?.eventDate.slice(0, 4) ?? null,
    },
  };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { featured, past, stats } = loaderData;

  // Past talks read best grouped by year, newest first.
  const byYear = new Map<string, typeof past>();
  for (const talk of past) {
    const year = talk.eventDate.slice(0, 4);
    byYear.set(year, [...(byYear.get(year) ?? []), talk]);
  }

  return (
    <>
      <SiteHeader />
      <main>
        <Hero stats={stats} />

        <div className="mx-auto max-w-5xl px-6">
          {featured ? (
            <section className="py-14">
              <SectionLabel>Most recent</SectionLabel>
              <Link
                to={`/talks/${featured.slug}`}
                className="card group mt-6 grid gap-0 overflow-hidden rounded-2xl sm:grid-cols-[1.1fr_1fr]"
              >
                <SlideThumb
                  url={featured.coverUrl}
                  alt={`Title slide of ${featured.title}`}
                  className="sm:aspect-auto sm:h-full"
                  rounded={false}
                />
                <div className="min-w-0 p-6 sm:p-8">
                  <Badge>{featured.conferenceName}</Badge>
                  <h2 className="mt-3 text-2xl font-semibold leading-snug tracking-tight underline-offset-4 group-hover:underline sm:text-3xl">
                    {featured.title}
                  </h2>
                  <p className="mt-2 text-sm text-[var(--muted)]">
                    {formatEventDate(featured.eventDate)}
                    {featured.location ? ` · ${featured.location}` : ""}
                  </p>
                  {featured.abstract && (
                    <p className="mt-4 line-clamp-4 text-[var(--muted)]">
                      {featured.abstract}
                    </p>
                  )}
                  <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--brand)]">
                    View slides
                    <span
                      aria-hidden="true"
                      className="transition-transform group-hover:translate-x-0.5"
                    >
                      →
                    </span>
                  </span>
                </div>
              </Link>
            </section>
          ) : (
            <section className="py-20">
              <p className="text-[var(--muted)]">No talks published yet.</p>
            </section>
          )}

          {past.length > 0 && (
            <section className="border-t border-[var(--border)] py-14">
              <SectionLabel>Past talks</SectionLabel>
              <div className="mt-8 space-y-12">
                {[...byYear.entries()].map(([year, talks]) => (
                  <div key={year}>
                    <h3 className="mb-5 flex items-center gap-4 text-sm font-semibold tabular-nums text-[var(--muted)]">
                      {year}
                      <span
                        aria-hidden="true"
                        className="h-px flex-1 bg-[var(--border)]"
                      />
                    </h3>
                    <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                      {talks.map((talk) => (
                        <li key={talk.id}>
                          <Link
                            to={`/talks/${talk.slug}`}
                            className="card group flex h-full flex-col overflow-hidden rounded-xl"
                          >
                            <SlideThumb
                              url={talk.coverUrl}
                              alt={`Title slide of ${talk.title}`}
                              rounded={false}
                            />
                            <div className="flex flex-1 flex-col p-4">
                              <Badge>{talk.conferenceName}</Badge>
                              <h4 className="mt-2 font-medium leading-snug underline-offset-4 group-hover:underline">
                                {talk.title}
                              </h4>
                              <p className="mt-auto pt-2 text-sm text-[var(--muted)]">
                                {formatEventDate(talk.eventDate)}
                                {talk.location ? ` · ${talk.location}` : ""}
                              </p>
                            </div>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

function Hero({
  stats,
}: {
  stats: { talks: number; conferences: number; since: string | null };
}) {
  return (
    <section className="relative overflow-hidden border-b border-[var(--border)]">
      {/* Soft brand wash behind the headline; decorative only. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-40 h-80 bg-[radial-gradient(60%_100%_at_50%_100%,var(--brand-soft),transparent)]"
      />
      <div className="relative mx-auto max-w-5xl px-6 py-16 sm:py-24">
        <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
          Speaking
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-[var(--muted)]">
          {SPEAKER_TAGLINE}
        </p>
        {stats.talks > 0 && (
          <dl className="mt-10 flex flex-wrap gap-x-10 gap-y-4">
            <Stat label={stats.talks === 1 ? "Talk" : "Talks"} value={stats.talks} />
            <Stat
              label={stats.conferences === 1 ? "Event" : "Events"}
              value={stats.conferences}
            />
            {stats.since && <Stat label="Speaking since" value={stats.since} />}
          </dl>
        )}
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
        {label}
      </dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--muted)]">
      {children}
    </h2>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block max-w-full truncate rounded-full bg-[var(--brand-soft)] px-2.5 py-1 text-xs font-medium text-[var(--brand)]">
      {children}
    </span>
  );
}

function SlideThumb({
  url,
  alt,
  className = "",
  rounded = true,
}: {
  url: string | null;
  alt: string;
  className?: string;
  rounded?: boolean;
}) {
  return (
    <div
      className={`aspect-video min-w-0 overflow-hidden bg-[var(--surface-strong)] ${
        rounded ? "rounded-xl border border-[var(--border)]" : ""
      } ${className}`}
    >
      {url ? (
        <img
          src={url}
          alt={alt}
          loading="lazy"
          className="size-full object-contain"
        />
      ) : (
        <div className="flex size-full items-center justify-center text-sm text-[var(--muted)]">
          No slides
        </div>
      )}
    </div>
  );
}
