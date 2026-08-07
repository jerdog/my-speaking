import type { Route } from "./+types/slides";
import { env } from "cloudflare:workers";

export async function loader({ params }: Route.LoaderArgs) {
  const key = params["*"];

  if (!/^talks\/[a-z0-9-]+\/(slide-\d+\.webp|source\.pdf)$/.test(key)) {
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
