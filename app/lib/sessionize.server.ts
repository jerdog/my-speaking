import type { Talk } from "~/lib/db";

export interface SessionizeEvent {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  location: string | null;
  website: string | null;
}

interface SessionizeFeed {
  events?: {
    id?: number | string;
    name?: string;
    eventStartDate?: string;
    eventEndDate?: string;
    location?: string | null;
    website?: string | null;
  }[];
}

/**
 * Sessionize's speaker feed lists every event a speaker has been accepted to,
 * past and future, but does not say which session was delivered at which event
 * — so it can only tell us an event happened, not what was presented there.
 */
export async function fetchSessionizeEvents(
  speakerId: string,
): Promise<SessionizeEvent[]> {
  const response = await fetch(
    `https://sessionize.com/api/speaker/json/${encodeURIComponent(speakerId)}`,
    { cf: { cacheTtl: 3600, cacheEverything: true } },
  );
  if (!response.ok) {
    throw new Error(`Sessionize returned ${response.status}`);
  }

  const feed = await response.json<SessionizeFeed>();

  return (feed.events ?? []).flatMap((event) => {
    if (!event.name || !event.eventStartDate) return [];
    return [
      {
        id: String(event.id ?? event.name),
        name: event.name,
        startDate: event.eventStartDate.slice(0, 10),
        endDate: (event.eventEndDate ?? event.eventStartDate).slice(0, 10),
        location: event.location ?? null,
        website: event.website ?? null,
      },
    ];
  });
}

export interface SessionizeSplit {
  upcoming: SessionizeEvent[];
  needsSlides: SessionizeEvent[];
}

export function splitSessionizeEvents(
  events: SessionizeEvent[],
  talks: Talk[],
  today: string,
): SessionizeSplit {
  const upcoming: SessionizeEvent[] = [];
  const needsSlides: SessionizeEvent[] = [];

  for (const event of events) {
    if (event.endDate >= today) {
      upcoming.push(event);
    } else if (!talks.some((talk) => matchesEvent(talk, event))) {
      needsSlides.push(event);
    }
  }

  upcoming.sort((a, b) => a.startDate.localeCompare(b.startDate));
  needsSlides.sort((a, b) => b.startDate.localeCompare(a.startDate));

  return { upcoming, needsSlides };
}

function matchesEvent(talk: Talk, event: SessionizeEvent): boolean {
  if (talk.sessionizeEventId && talk.sessionizeEventId === event.id) {
    return true;
  }
  // Conference names recur annually, so the year has to match too.
  return (
    normalize(talk.conferenceName) === normalize(event.name) &&
    talk.eventDate.slice(0, 4) === event.startDate.slice(0, 4)
  );
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}
