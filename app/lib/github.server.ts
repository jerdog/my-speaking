export interface RepoSuggestion {
  fullName: string;
  url: string;
  description: string | null;
  stars: number;
  updatedAt: string;
}

/**
 * Rate limiting is the normal failure here, not an exception: unauthenticated
 * code search allows only a handful of requests a minute, so the caller needs
 * to tell "no match" apart from "ask again later".
 */
export type SuggestResult =
  | { ok: true; suggestions: RepoSuggestion[] }
  | { ok: false; error: string; rateLimited: boolean };

const SEARCH_URL = "https://api.github.com/search/repositories";

/**
 * Words that say nothing about which repo a talk belongs to. Dropping them
 * keeps the query on the distinctive part of the title.
 */
const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "from", "how",
  "in", "is", "it", "of", "on", "or", "this", "that", "the", "to", "we", "what",
  "when", "where", "which", "who", "why", "with", "you", "your", "my", "i",
  "talk", "talks", "slides", "deck", "presentation", "intro", "introduction",
]);

export function searchTermsFor(title: string): string[] {
  return [
    ...new Set(
      title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, " ")
        .split(/[\s-]+/)
        // Bare numbers ("101", a year) match everything and nothing, so they
        // only widen the search.
        .filter(
          (word) =>
            word.length > 2 && !STOP_WORDS.has(word) && !/^\d+$/.test(word),
        ),
    ),
  ].slice(0, 6);
}

export async function suggestRepos(
  username: string,
  title: string,
  limit = 5,
): Promise<SuggestResult> {
  if (!username) {
    return {
      ok: false,
      rateLimited: false,
      error: "Set GITHUB_USERNAME in wrangler.jsonc to look up repos.",
    };
  }

  const terms = searchTermsFor(title);
  if (terms.length === 0) {
    return { ok: true, suggestions: [] };
  }

  const query = `${terms.join(" ")} user:${username} in:name,description,readme`;
  const url = `${SEARCH_URL}?q=${encodeURIComponent(query)}&sort=updated&per_page=${limit}`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
        // GitHub rejects API requests without one.
        "User-Agent": "speaking-site-admin",
      },
    });
  } catch (error) {
    return {
      ok: false,
      rateLimited: false,
      error: error instanceof Error ? error.message : "GitHub request failed",
    };
  }

  if (response.status === 403 || response.status === 429) {
    return {
      ok: false,
      rateLimited: true,
      error:
        "GitHub rate limit reached — unauthenticated search allows about 10 lookups a minute. Wait a minute and try again.",
    };
  }
  if (!response.ok) {
    return {
      ok: false,
      rateLimited: false,
      error: `GitHub returned ${response.status}`,
    };
  }

  const body = await response.json<{ items?: unknown }>();
  const items = Array.isArray(body.items) ? body.items : [];

  return {
    ok: true,
    suggestions: items.flatMap((item) => {
      const repo = item as Record<string, unknown>;
      const fullName = typeof repo.full_name === "string" ? repo.full_name : null;
      const htmlUrl = typeof repo.html_url === "string" ? repo.html_url : null;
      if (!fullName || !htmlUrl) return [];
      return [
        {
          fullName,
          url: htmlUrl,
          description:
            typeof repo.description === "string" ? repo.description : null,
          stars:
            typeof repo.stargazers_count === "number" ? repo.stargazers_count : 0,
          updatedAt:
            typeof repo.updated_at === "string" ? repo.updated_at : "",
        },
      ];
    }),
  };
}
