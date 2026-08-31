import { env } from "cloudflare:workers";

import { sourcePdfKey } from "~/lib/r2";

export class DeckImportError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/**
 * Streams a deck from an external URL into R2. The Worker does this rather than
 * the browser because the source host won't send CORS headers.
 */
export async function storeDeckFromUrl(
  talkId: string,
  version: number,
  rawUrl: string,
): Promise<void> {
  let source: URL;
  try {
    source = new URL(rawUrl.trim());
  } catch {
    throw new DeckImportError("Invalid url", 400);
  }

  // http is allowed in dev so the flow can be exercised against a local file.
  const allowed = import.meta.env.DEV ? ["https:", "http:"] : ["https:"];
  if (!allowed.includes(source.protocol)) {
    throw new DeckImportError("URL must be https", 400);
  }

  const response = await fetch(source, { redirect: "follow" });
  if (!response.ok || !response.body) {
    throw new DeckImportError(`Source returned ${response.status}`, 502);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("pdf") && !source.pathname.endsWith(".pdf")) {
    throw new DeckImportError(
      `Expected a PDF, got ${contentType || "unknown type"}`,
      415,
    );
  }

  await env.SLIDES_BUCKET.put(sourcePdfKey(talkId, version), response.body, {
    httpMetadata: {
      contentType: "application/pdf",
      cacheControl: "public, max-age=31536000, immutable",
    },
  });
}
