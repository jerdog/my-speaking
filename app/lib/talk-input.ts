export interface TalkFields {
  title: string;
  conferenceName: string;
  eventDate: string;
  conferenceUrl: string | null;
  location: string | null;
  abstract: string | null;
  videoUrl: string | null;
  repoUrl: string | null;
}

export type ValidationResult =
  | { ok: true; value: TalkFields }
  | { ok: false; error: string };

/**
 * Shared by the create API and the edit form so a talk can't be edited into a
 * state the create path would have rejected.
 */
export function validateTalkFields(
  input: Record<string, unknown>,
): ValidationResult {
  const title = trimmed(input.title);
  const conferenceName = trimmed(input.conferenceName);
  const eventDate = trimmed(input.eventDate);

  if (!title || !conferenceName || !eventDate) {
    return { ok: false, error: "title, conferenceName and eventDate are required" };
  }
  if (!isCalendarDate(eventDate)) {
    return { ok: false, error: "eventDate must be a valid YYYY-MM-DD date" };
  }

  // These are rendered as hrefs, so anything that isn't an http(s) URL is
  // rejected rather than stored — a `javascript:` link would otherwise run on
  // the public talk page.
  const links = {
    conferenceUrl: trimmed(input.conferenceUrl),
    videoUrl: trimmed(input.videoUrl),
    repoUrl: trimmed(input.repoUrl),
  };
  for (const [key, value] of Object.entries(links)) {
    if (value !== null && !isHttpUrl(value)) {
      return { ok: false, error: `${key} must be an http(s) URL` };
    }
  }

  return {
    ok: true,
    value: {
      title,
      conferenceName,
      eventDate,
      location: trimmed(input.location),
      abstract: trimmed(input.abstract),
      ...links,
    },
  };
}

export function trimmed(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text === "" ? null : text;
}

function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  // Rejects things like 2025-02-30, which pass the pattern but roll over.
  return new Date(`${value}T00:00:00Z`).toISOString().startsWith(value);
}
