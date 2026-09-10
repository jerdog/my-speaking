import { env } from "cloudflare:workers";

import type { Route } from "./+types/api.repo-suggest";
import { requireAdmin } from "~/lib/access.server";
import { getTalkById } from "~/lib/db";
import { suggestRepos } from "~/lib/github.server";

/**
 * Looks up candidate GitHub repos for one talk. Kept as its own route so the
 * admin page can suggest for many talks without a full navigation each time,
 * and so a rate limit stops that loop instead of failing the whole page.
 */
export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);

  const talkId = new URL(request.url).searchParams.get("talkId");
  if (!talkId) {
    return Response.json({ error: "talkId is required" }, { status: 400 });
  }

  const talk = await getTalkById(env.DB, talkId);
  if (!talk) {
    return Response.json({ error: "Talk not found" }, { status: 404 });
  }

  const result = await suggestRepos(env.GITHUB_USERNAME ?? "", talk.title);
  if (!result.ok) {
    return Response.json(
      { error: result.error, rateLimited: result.rateLimited },
      { status: result.rateLimited ? 429 : 502 },
    );
  }

  return Response.json({ talkId, suggestions: result.suggestions });
}
