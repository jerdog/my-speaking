import { env } from "cloudflare:workers";

import type { Route } from "./+types/api.talk-source";
import { requireAdmin } from "~/lib/access.server";
import { getTalkById } from "~/lib/db";
import { sourcePdfKey } from "~/lib/r2";

/**
 * Reads back a deck that hasn't been published yet, so the admin page can
 * rasterize a freshly imported PDF. The public /slides/* route deliberately
 * refuses unpublished versions, so this admin-only read is the way in.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  await requireAdmin(request);

  const talk = await getTalkById(env.DB, params.id);
  if (!talk) {
    return Response.json({ error: "Talk not found" }, { status: 404 });
  }

  const version = Number(params.version);
  if (!Number.isInteger(version) || version < 1) {
    return Response.json({ error: "Invalid version" }, { status: 400 });
  }

  const object = await env.SLIDES_BUCKET.get(sourcePdfKey(talk.id, version));
  if (!object) {
    return Response.json({ error: "No deck stored" }, { status: 404 });
  }

  return new Response(object.body, {
    headers: {
      "content-type": "application/pdf",
      "cache-control": "private, no-store",
    },
  });
}

export async function action({ request, params }: Route.ActionArgs) {
  await requireAdmin(request);

  if (request.method !== "PUT") {
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

  if (!request.body) {
    return Response.json({ error: "Missing PDF body" }, { status: 400 });
  }

  await env.SLIDES_BUCKET.put(sourcePdfKey(talk.id, version), request.body, {
    httpMetadata: {
      contentType: "application/pdf",
      cacheControl: "public, max-age=31536000, immutable",
    },
  });

  return Response.json({ ok: true });
}
