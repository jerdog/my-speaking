import { env } from "cloudflare:workers";

import type { Route } from "./+types/api.talk-import-source";
import { requireAdmin } from "~/lib/access.server";
import { getTalkById } from "~/lib/db";
import { sourcePdfKey } from "~/lib/r2";

/**
 * Pulls a deck from an external URL into R2. The Worker fetches it rather than
 * the browser because the source host won't send CORS headers, and because
 * streaming it straight into R2 avoids holding the file in the page.
 */
export async function action({ request, params }: Route.ActionArgs) {
  await requireAdmin(request);

  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const talk = await getTalkById(env.DB, params.id);
  if (!talk) {
    return Response.json({ error: "Talk not found" }, { status: 404 });
  }

  const version = Number(params.version);
  if (!Number.isInteger(version) || version <= talk.slidesVersion) {
    return Response.json({ error: "Invalid upload version" }, { status: 400 });
  }

  const { url } = await request.json<{ url?: unknown }>();
  if (typeof url !== "string" || !url.trim()) {
    return Response.json({ error: "Missing url" }, { status: 400 });
  }

  let source: URL;
  try {
    source = new URL(url.trim());
  } catch {
    return Response.json({ error: "Invalid url" }, { status: 400 });
  }
  // http is allowed in dev so the flow can be exercised against a local file.
  const allowed = import.meta.env.DEV ? ["https:", "http:"] : ["https:"];
  if (!allowed.includes(source.protocol)) {
    return Response.json({ error: "URL must be https" }, { status: 400 });
  }

  const response = await fetch(source, { redirect: "follow" });
  if (!response.ok || !response.body) {
    return Response.json(
      { error: `Source returned ${response.status}` },
      { status: 502 },
    );
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("pdf") && !source.pathname.endsWith(".pdf")) {
    return Response.json(
      { error: `Expected a PDF, got ${contentType || "unknown type"}` },
      { status: 415 },
    );
  }

  await env.SLIDES_BUCKET.put(sourcePdfKey(talk.id, version), response.body, {
    httpMetadata: {
      contentType: "application/pdf",
      cacheControl: "public, max-age=31536000, immutable",
    },
  });

  return Response.json({ ok: true });
}
