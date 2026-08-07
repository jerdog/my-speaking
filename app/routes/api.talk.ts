import { env } from "cloudflare:workers";

import type { Route } from "./+types/api.talk";
import { requireAdmin } from "~/lib/access.server";
import { commitTalkSlides, getTalkById } from "~/lib/db";
import { deleteOtherVersions, MAX_SLIDES } from "~/lib/r2";

export async function action({ request, params }: Route.ActionArgs) {
  await requireAdmin(request);

  if (request.method !== "PATCH") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const talk = await getTalkById(env.DB, params.id);
  if (!talk) {
    return Response.json({ error: "Talk not found" }, { status: 404 });
  }

  const body = await request.json<{
    slideCount?: unknown;
    uploadVersion?: unknown;
  }>();

  const slideCount = Number(body.slideCount);
  if (
    !Number.isInteger(slideCount) ||
    slideCount < 1 ||
    slideCount > MAX_SLIDES
  ) {
    return Response.json({ error: "Invalid slideCount" }, { status: 400 });
  }

  const uploadVersion = Number(body.uploadVersion);
  if (!Number.isInteger(uploadVersion) || uploadVersion <= talk.slidesVersion) {
    return Response.json({ error: "Invalid upload version" }, { status: 400 });
  }

  // Publishing the new version is the single point at which the deck changes;
  // only once that has landed is the previous one safe to remove.
  await commitTalkSlides(env.DB, talk.id, slideCount, uploadVersion);
  await deleteOtherVersions(env.SLIDES_BUCKET, talk.id, uploadVersion);

  return Response.json({ ok: true, slug: talk.slug });
}
