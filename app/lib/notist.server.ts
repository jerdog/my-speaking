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

/** How many linked presentations to resolve when a profile only lists refs. */
const MAX_FOLLOWED = 150;
const FOLLOW_BATCH = 6;

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    redirect: "follow",
  });
  if (!response.ok) {
    throw new Error(`Noti.st returned ${response.status} for ${url}`);
  }
  try {
    return await response.json();
  } catch {
    throw new Error(`${url} did not return JSON`);
  }
}

export async function fetchNotistPresentations(
  input: string,
  options: { skipDetailFor?: Set<string> } = {},
): Promise<NotistPresentation[]> {
  const root = await fetchJson(notistJsonUrl(input));
  const nodes = collectPresentationNodes(root);

  if (nodes.length === 0) {
    throw new Error(
      `No presentations found. The response contained ${describeShape(root)}.`,
    );
  }

  const parsed: NotistPresentation[] = [];
  const toFollow: string[] = [];

  for (const node of nodes) {
    const presentation = parsePresentation(node);
    if (presentation) {
      parsed.push(presentation);
      continue;
    }
    // A profile may list presentations as bare references; resolve those.
    const link = presentationLink(node);
    if (link) toFollow.push(link);
  }

  for (let i = 0; i < Math.min(toFollow.length, MAX_FOLLOWED); i += FOLLOW_BATCH) {
    const batch = toFollow.slice(i, i + FOLLOW_BATCH);
    const settled = await Promise.allSettled(batch.map(fetchJson));
    for (const result of settled) {
      if (result.status !== "fulfilled") continue;
      for (const node of collectPresentationNodes(result.value)) {
        const presentation = parsePresentation(node);
        if (presentation) parsed.push(presentation);
      }
    }
  }

  return withDetails(dedupeById(parsed), options.skipDetailFor);
}

/**
 * A profile listing carries titles but not the event or the deck — those only
 * appear on a presentation's own page. Fill the gaps from there, so an import
 * from a profile gets the same data as importing a single talk.
 */
async function withDetails(
  presentations: NotistPresentation[],
  skipDetailFor?: Set<string>,
): Promise<NotistPresentation[]> {
  // Talks already imported never need completing, which keeps repeat lookups
  // cheap as the backlog shrinks.
  const incomplete = presentations.filter(
    (p) =>
      p.pageUrl &&
      (!p.eventDate || !p.downloadUrl) &&
      !skipDetailFor?.has(p.id),
  );

  for (let i = 0; i < Math.min(incomplete.length, MAX_FOLLOWED); i += FOLLOW_BATCH) {
    const batch = incomplete.slice(i, i + FOLLOW_BATCH);
    const settled = await Promise.allSettled(
      batch.map((p) => fetchJson(notistJsonUrl(p.pageUrl!))),
    );

    settled.forEach((result, index) => {
      if (result.status !== "fulfilled") return;
      const detailed = collectPresentationNodes(result.value)
        .map(parsePresentation)
        .find((p): p is NotistPresentation => p !== null);
      if (detailed) Object.assign(batch[index], merge(batch[index], detailed));
    });
  }

  return presentations;
}

/**
 * A presentation's own page is the fuller record — a profile listing may carry
 * a shortened blurb and no event — so its values win, with the listing filling
 * anything the detail page happens to omit.
 */
function merge(
  thin: NotistPresentation,
  detailed: NotistPresentation,
): NotistPresentation {
  return {
    ...thin,
    title: detailed.title || thin.title,
    slug: detailed.slug || thin.slug,
    abstract: detailed.abstract ?? thin.abstract,
    downloadUrl: detailed.downloadUrl ?? thin.downloadUrl,
    conferenceName: detailed.conferenceName ?? thin.conferenceName,
    conferenceUrl: detailed.conferenceUrl ?? thin.conferenceUrl,
    eventDate: detailed.eventDate ?? thin.eventDate,
    location: detailed.location ?? thin.location,
  };
}

/**
 * Walks the whole response rather than assuming where presentations sit: a
 * presentation page returns them at the top level, but a profile nests them
 * under the profile's own entry.
 */
function collectPresentationNodes(value: unknown): Record<string, any>[] {
  const found: Record<string, any>[] = [];
  const seen = new Set<unknown>();

  const walk = (node: unknown, depth: number) => {
    if (depth > 8 || !isRecord(node) || seen.has(node)) return;
    seen.add(node);

    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }

    if (node.type === "presentations") found.push(node);
    for (const child of Object.values(node)) walk(child, depth + 1);
  };

  walk(value, 0);

  if (found.length > 0) return found;

  // Fall back to shape when `type` is absent, without mistaking an event for a
  // presentation — events carry a title and slug too, but never a deck.
  const byShape: Record<string, any>[] = [];
  const walkShape = (node: unknown, depth: number) => {
    if (depth > 8 || !isRecord(node)) return;
    if (Array.isArray(node)) {
      for (const item of node) walkShape(item, depth + 1);
      return;
    }
    const attributes = node.attributes;
    if (
      node.type !== "events" &&
      isRecord(attributes) &&
      typeof attributes.title === "string" &&
      (typeof attributes.download === "string" || "slidedeck" in attributes)
    ) {
      byShape.push(node);
    }
    for (const child of Object.values(node)) walkShape(child, depth + 1);
  };
  walkShape(value, 0);
  return byShape;
}

/** A reference to a presentation whose details live at another URL. */
function presentationLink(node: Record<string, any>): string | null {
  const links = node.links;
  if (!isRecord(links)) return null;
  for (const key of ["related", "self"]) {
    const value = links[key];
    if (typeof value === "string" && value) {
      try {
        return notistJsonUrl(value);
      } catch {
        return null;
      }
    }
  }
  return null;
}

function dedupeById(items: NotistPresentation[]): NotistPresentation[] {
  const byId = new Map<string, NotistPresentation>();
  for (const item of items) {
    if (!byId.has(item.id)) byId.set(item.id, item);
  }
  return [...byId.values()];
}

/** Used in the error when nothing matched, so the response can be diagnosed. */
function describeShape(value: unknown): string {
  const types = new Set<string>();
  const keys = new Set<string>();

  const walk = (node: unknown, depth: number) => {
    if (depth > 6 || !isRecord(node)) return;
    if (Array.isArray(node)) {
      for (const item of node.slice(0, 20)) walk(item, depth + 1);
      return;
    }
    if (typeof node.type === "string") types.add(node.type);
    if (depth <= 1) for (const key of Object.keys(node)) keys.add(key);
    for (const child of Object.values(node)) walk(child, depth + 1);
  };
  walk(value, 0);

  const parts = [];
  if (keys.size) parts.push(`keys [${[...keys].slice(0, 10).join(", ")}]`);
  parts.push(
    types.size
      ? `types [${[...types].slice(0, 10).join(", ")}]`
      : "no typed entries",
  );
  return parts.join(" and ");
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
