export interface TalkFields {
  title: string;
  conferenceName: string;
  eventDate: string;
  conferenceUrl: string | null;
  location: string | null;
  abstract: string | null;
  videoUrl: string | null;
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

  return {
    ok: true,
    value: {
      title,
      conferenceName,
      eventDate,
      conferenceUrl: trimmed(input.conferenceUrl),
      location: trimmed(input.location),
      abstract: trimmed(input.abstract),
      videoUrl: trimmed(input.videoUrl),
    },
  };
}

export function trimmed(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text === "" ? null : text;
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  // Rejects things like 2025-02-30, which pass the pattern but roll over.
  return new Date(`${value}T00:00:00Z`).toISOString().startsWith(value);
}
