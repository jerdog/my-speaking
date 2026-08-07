import { env } from "cloudflare:workers";

import type { Route } from "./+types/api.talks";
import { requireAdmin } from "~/lib/access.server";
import { getTalkBySlug, insertTalk, slugify } from "~/lib/db";
import { trimmed, validateTalkFields } from "~/lib/talk-input";

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);

  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const body = await request.json<Record<string, unknown>>();
  const fields = validateTalkFields(body);
  if (!fields.ok) {
    return Response.json({ error: fields.error }, { status: 400 });
  }

  const id = crypto.randomUUID();
  const slug = await uniqueSlug(env.DB, slugify(fields.value.title) || id);

  await insertTalk(env.DB, {
    id,
    slug,
    ...fields.value,
    sessionizeEventId: trimmed(body.sessionizeEventId),
  });

  // A brand new talk has no committed deck, so the first upload is version 1.
  return Response.json({ id, slug, uploadVersion: 1 }, { status: 201 });
}

async function uniqueSlug(db: D1Database, base: string): Promise<string> {
  let candidate = base;
  for (let n = 2; await getTalkBySlug(db, candidate); n++) {
    candidate = `${base}-${n}`;
  }
  return candidate;
}
