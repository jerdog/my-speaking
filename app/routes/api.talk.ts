import type { Route } from "./+types/api.talk";
import { requireAdmin } from "~/lib/access.server";
import { env } from "cloudflare:workers";
import { getTalkById, setTalkSlideCount } from "~/lib/db";
import { sourcePdfKey } from "~/lib/r2";

export async function action({ request, params }: Route.ActionArgs) {
  await requireAdmin(request);

  if (request.method !== "PATCH") {
    return new Response("Method Not Allowed", { status: 405 });
  }


  const talk = await getTalkById(env.DB, params.id);
  if (!talk) {
    return Response.json({ error: "Talk not found" }, { status: 404 });
  }

  const body = await request.json<{ slideCount?: unknown }>();
  const slideCount = Number(body.slideCount);
  if (!Number.isInteger(slideCount) || slideCount < 1) {
    return Response.json({ error: "Invalid slideCount" }, { status: 400 });
  }

  await setTalkSlideCount(env.DB, talk.id, slideCount, sourcePdfKey(talk.id));

  return Response.json({ ok: true, slug: talk.slug });
}
