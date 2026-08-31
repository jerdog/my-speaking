import { env } from "cloudflare:workers";

import type { Route } from "./+types/slides";
import { optionalAdmin } from "~/lib/access.server";
import { getTalkById } from "~/lib/db";

const KEY_PATTERN =
  /^talks\/([0-9a-f-]{36})\/v(\d+)\/(?:slide-\d+\.webp|source\.pdf)$/;

export async function loader({ request, params }: Route.LoaderArgs) {
  const key = params["*"];
  const match = KEY_PATTERN.exec(key);
  if (!match) {
    throw new Response("Not Found", { status: 404 });
  }

  const [, talkId, version] = match;

  const talk = await getTalkById(env.DB, talkId);
  const isLiveVersion = talk?.slidesVersion === Number(version);
  if (!talk || !isLiveVersion) {
    throw new Response("Not Found", { status: 404 });
  }

  // A draft's slides back its private preview, so the admin can see them while
  // everyone else gets a 404 — matching the talk page itself.
  const isDraft = !talk.published;
  if (isDraft && (await optionalAdmin(request)) === null) {
    throw new Response("Not Found", { status: 404 });
  }

  const object = await env.SLIDES_BUCKET.get(key);
  if (!object) {
    throw new Response("Not Found", { status: 404 });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  // Never let a draft's slides sit in a shared cache: publishing doesn't change
  // the URL, so a cached 404 or body would outlive the draft.
  headers.set(
    "cache-control",
    isDraft ? "private, no-store" : "public, max-age=31536000, immutable",
  );

  return new Response(object.body, { headers });
}
