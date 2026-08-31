export interface NotistPresentation {
  /** Noti.st presentation id without its `pr_` prefix, e.g. "21UNMQ". */
  id: string;
  title: string;
  slug: string;
  abstract: string | null;
  downloadUrl: string | null;
  conferenceName: string | null;
  conferenceUrl: string | null;
  eventDate: string | null;
  location: string | null;
  pageUrl: string | null;
}

interface Envelope {
  data?: unknown;
}

/**
 * Noti.st never shipped the export API promised in its docs, but every public
 * page serves JSON by appending `.json`, and that carries everything needed:
 * the talk, its event, and a link to the rendered PDF.
 */
export function notistJsonUrl(input: string): string {
  const url = new URL(input.trim());
  if (url.pathname.endsWith(".json")) return url.toString();

  // Presentation pages are /<id>/<slug> (custom domain) or /<user>/<id>/<slug>;
  // the JSON lives at the same path with the slug dropped.
  const segments = url.pathname.split("/").filter(Boolean);
  const path =
    segments.length > 1 ? segments.slice(0, -1).join("/") : segments.join("/");

  url.pathname = `/${path}.json`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

export async function fetchNotistPresentations(
  input: string,
): Promise<NotistPresentation[]> {
  const response = await fetch(notistJsonUrl(input), {
    headers: { accept: "application/json" },
    redirect: "follow",
  });
  if (!response.ok) {
    throw new Error(`Noti.st returned ${response.status}`);
  }

  const body = await response.json<Envelope>();
  const entries = Array.isArray(body.data) ? body.data : [];

  return entries
    .filter(isPresentation)
    .map(parsePresentation)
    .filter((p): p is NotistPresentation => p !== null);
}

function isPresentation(entry: unknown): entry is Record<string, any> {
  return (
    isRecord(entry) &&
    (entry.type === "presentations" || isRecord(entry.attributes))
  );
}

function parsePresentation(
  entry: Record<string, any>,
): NotistPresentation | null {
  const attributes = entry.attributes;
  if (!isRecord(attributes) || typeof attributes.title !== "string") return null;

  const event = firstEvent(entry.relationships);

  return {
    id: String(entry.id ?? "").replace(/^pr_/, ""),
    title: attributes.title,
    slug: typeof attributes.slug === "string" ? attributes.slug : "",
    abstract: htmlToText(attributes.blurb),
    downloadUrl:
      typeof attributes.download === "string" ? attributes.download : null,
    conferenceName: typeof event?.title === "string" ? event.title : null,
    conferenceUrl: typeof event?.url === "string" ? event.url : null,
    eventDate: dateOnly(event?.starts_on),
    location: typeof event?.address === "string" ? event.address : null,
    pageUrl: typeof entry.links?.self === "string" ? entry.links.self : null,
  };
}

function firstEvent(
  relationships: unknown,
): Record<string, any> | undefined {
  if (!isRecord(relationships) || !Array.isArray(relationships.data)) return;
  const event = relationships.data.find(
    (item) => isRecord(item) && item.type === "events",
  );
  return isRecord(event) && isRecord(event.attributes)
    ? event.attributes
    : undefined;
}

/** "2026-05-18 08:00:00" -> "2026-05-18" */
function dateOnly(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = value.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : null;
}

/**
 * Blurbs come through as HTML. Talk abstracts render as plain text, so keep the
 * paragraph breaks and drop the markup.
 */
function htmlToText(blurb: unknown): string | null {
  const html = isRecord(blurb) && typeof blurb.html === "string" ? blurb.html : "";
  if (!html) return null;

  const text = html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*(p|div|li|h[1-6])\s*>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&#x27;/gi, "'")
    .replace(/&#8217;|&rsquo;/gi, "’")
    .replace(/&#8216;|&lsquo;/gi, "‘")
    .replace(/&#8220;|&ldquo;/gi, "“")
    .replace(/&#8221;|&rdquo;/gi, "”")
    .replace(/&#8212;|&mdash;/gi, "—")
    .replace(/&#8230;|&hellip;/gi, "…")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return text || null;
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null;
}
