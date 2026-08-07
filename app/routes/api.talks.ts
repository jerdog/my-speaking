import type { Route } from "./+types/api.talks";
import { requireAdmin } from "~/lib/access.server";
import { env } from "cloudflare:workers";
import { getTalkBySlug, insertTalk, slugify } from "~/lib/db";

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);

  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const body = await request.json<Record<string, unknown>>();

  const title = asTrimmedString(body.title);
  const conferenceName = asTrimmedString(body.conferenceName);
  const eventDate = asTrimmedString(body.eventDate);

  if (!title || !conferenceName || !eventDate) {
    return Response.json(
      { error: "title, conferenceName and eventDate are required" },
      { status: 400 },
    );
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
    return Response.json(
      { error: "eventDate must be YYYY-MM-DD" },
      { status: 400 },
    );
  }

  const id = crypto.randomUUID();
  const slug = await uniqueSlug(env.DB, slugify(title) || id);

  await insertTalk(env.DB, {
    id,
    slug,
    title,
    conferenceName,
    conferenceUrl: asTrimmedString(body.conferenceUrl),
    location: asTrimmedString(body.location),
    eventDate,
    abstract: asTrimmedString(body.abstract),
    videoUrl: asTrimmedString(body.videoUrl),
    sessionizeEventId: asTrimmedString(body.sessionizeEventId),
  });

  return Response.json({ id, slug }, { status: 201 });
}

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

async function uniqueSlug(db: D1Database, base: string): Promise<string> {
  let candidate = base;
  for (let n = 2; await getTalkBySlug(db, candidate); n++) {
    candidate = `${base}-${n}`;
  }
  return candidate;
}
