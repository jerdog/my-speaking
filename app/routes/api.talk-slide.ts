import { env } from "cloudflare:workers";

import type { Route } from "./+types/api.talk-slide";
import { requireAdmin } from "~/lib/access.server";
import { getTalkById } from "~/lib/db";
import { MAX_SLIDES, slideKey } from "~/lib/r2";

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

  const slideNumber = Number(params.n);
  if (
    !Number.isInteger(slideNumber) ||
    slideNumber < 1 ||
    slideNumber > MAX_SLIDES
  ) {
    return Response.json({ error: "Invalid slide number" }, { status: 400 });
  }

  if (!request.body) {
    return Response.json({ error: "Missing image body" }, { status: 400 });
  }

  await env.SLIDES_BUCKET.put(
    slideKey(talk.id, version, slideNumber),
    request.body,
    {
      httpMetadata: {
        contentType: "image/webp",
        cacheControl: "public, max-age=31536000, immutable",
      },
    },
  );

  return Response.json({ ok: true });
}
