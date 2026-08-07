import { Link } from "react-router";

import type { Route } from "./+types/admin.index";
import { requireAdmin } from "~/lib/access.server";
import { env } from "cloudflare:workers";
import { listAllTalks } from "~/lib/db";
import { formatEventDate } from "~/lib/format";
import {
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

export default function AdminDashboard({ loaderData }: Route.ComponentProps) {
  const { talks, sessionize } = loaderData;

  return (
    <div className="space-y-12">
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
          <h2 className="mb-1 text-sm font-semibold text-amber-400">
            Needs slides
          </h2>
          <p className="mb-4 text-sm text-neutral-500">
            These events have already happened per Sessionize, but have no talk
            here yet.
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
                <Link
                  to={`/admin/talks/new?${newTalkParams(event)}`}
                  className="shrink-0 rounded border border-neutral-700 px-3 py-1.5 text-sm hover:border-neutral-500"
                >
                  Add slides
                </Link>
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
                    {talk.published ? "" : " · draft"}
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
