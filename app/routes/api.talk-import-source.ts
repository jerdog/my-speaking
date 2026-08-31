import { env } from "cloudflare:workers";

import type { Route } from "./+types/api.talk-import-source";
import { requireAdmin } from "~/lib/access.server";
import { DeckImportError, storeDeckFromUrl } from "~/lib/deck-import.server";
import { getTalkById } from "~/lib/db";

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

  const body = await request.json<{ url?: unknown }>();
  // Falls back to the deck recorded at import time, so the browser doesn't have
  // to carry the URL around while working through a batch.
  const url =
    typeof body.url === "string" && body.url.trim()
      ? body.url
      : talk.notistDownloadUrl;

  if (!url) {
    return Response.json({ error: "No deck URL for this talk" }, { status: 400 });
  }

  try {
    await storeDeckFromUrl(talk.id, version, url);
  } catch (error) {
    if (error instanceof DeckImportError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }

  return Response.json({ ok: true });
}
