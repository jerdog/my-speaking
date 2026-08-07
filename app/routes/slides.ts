import { env } from "cloudflare:workers";

import type { Route } from "./+types/slides";
import { getTalkById } from "~/lib/db";

const KEY_PATTERN =
  /^talks\/([0-9a-f-]{36})\/v(\d+)\/(?:slide-\d+\.webp|source\.pdf)$/;

export async function loader({ params }: Route.LoaderArgs) {
  const key = params["*"];
  const match = KEY_PATTERN.exec(key);
  if (!match) {
    throw new Response("Not Found", { status: 404 });
  }

  const [, talkId, version] = match;

  // Only the live deck of a published talk is public. Without this, drafts and
  // decks mid-replacement would be readable by anyone who guessed the key.
  const talk = await getTalkById(env.DB, talkId);
  if (!talk || !talk.published || talk.slidesVersion !== Number(version)) {
    throw new Response("Not Found", { status: 404 });
  }

  const object = await env.SLIDES_BUCKET.get(key);
  if (!object) {
    throw new Response("Not Found", { status: 404 });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "public, max-age=31536000, immutable");

  return new Response(object.body, { headers });
}
