import { createRemoteJWKSet, jwtVerify } from "jose";

import { env } from "cloudflare:workers";

export interface AdminIdentity {
  email: string;
}

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJwks(teamDomain: string) {
  let jwks = jwksCache.get(teamDomain);
  if (!jwks) {
    jwks = createRemoteJWKSet(
      new URL(`https://${teamDomain}/cdn-cgi/access/certs`),
    );
    jwksCache.set(teamDomain, jwks);
  }
  return jwks;
}

/**
 * Verifies the Cloudflare Access JWT. Cloudflare Access already gates these
 * routes at the edge; this re-check means a misconfigured or removed Access
 * application cannot silently expose the admin API to the internet.
 */
export async function requireAdmin(request: Request): Promise<AdminIdentity> {
  requireSameOrigin(request);

  const identity = await resolveAdmin(request);
  if (!identity) {
    throw new Response("Unauthorized", { status: 401 });
  }
  return identity;
}

/**
 * Identifies the admin without demanding it, so public pages can show a talk
 * that isn't published yet to the person who owns it and stay a plain 404 for
 * everybody else.
 */
export async function optionalAdmin(
  request: Request,
): Promise<AdminIdentity | null> {
  try {
    return await resolveAdmin(request);
  } catch {
    return null;
  }
}

async function resolveAdmin(request: Request): Promise<AdminIdentity | null> {
  // Access sits in front of the deployed site, so there is no JWT to verify
  // locally. `import.meta.env.DEV` is statically false in production builds,
  // so this branch is stripped from the deployed Worker.
  if (import.meta.env.DEV) {
    return { email: env.ADMIN_EMAIL };
  }

  const token =
    request.headers.get("Cf-Access-Jwt-Assertion") ??
    parseCookie(request.headers.get("Cookie"), "CF_Authorization");

  if (!token) return null;

  let email: unknown;
  try {
    const { payload } = await jwtVerify(token, getJwks(env.CF_ACCESS_TEAM_DOMAIN), {
      issuer: `https://${env.CF_ACCESS_TEAM_DOMAIN}`,
      audience: env.CF_ACCESS_AUD,
    });
    email = payload.email;
  } catch {
    return null;
  }

  if (
    typeof email !== "string" ||
    email.toLowerCase() !== env.ADMIN_EMAIL.toLowerCase()
  ) {
    return null;
  }

  return { email };
}

/**
 * Access authenticates with a cookie, so a form post from another site would
 * otherwise carry full admin rights. Browsers always send `Origin` on
 * state-changing requests, so requiring it to match blocks cross-site writes.
 */
function requireSameOrigin(request: Request): void {
  if (request.method === "GET" || request.method === "HEAD") return;

  const origin = request.headers.get("Origin");
  if (origin !== new URL(request.url).origin) {
    throw new Response("Forbidden", { status: 403 });
  }
}

function parseCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}
