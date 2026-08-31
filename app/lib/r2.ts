/** Upper bound on slides per deck, shared by the upload and finalize routes. */
export const MAX_SLIDES = 500;

function versionPrefix(talkId: string, version: number): string {
  return `talks/${talkId}/v${version}`;
}

export function slideKey(
  talkId: string,
  version: number,
  slideNumber: number,
): string {
  return `${versionPrefix(talkId, version)}/slide-${slideNumber}.webp`;
}

export function sourcePdfKey(talkId: string, version: number): string {
  return `${versionPrefix(talkId, version)}/source.pdf`;
}

/**
 * Slides are public, so they're served straight from an R2 custom domain when
 * one is configured. Without it they fall back to being streamed by the Worker,
 * which keeps local dev and a fresh deploy working before DNS is set up.
 */
function publicUrl(cdnBaseUrl: string, key: string): string {
  const base = cdnBaseUrl.trim().replace(/\/$/, "");
  if (!base) return `/slides/${key}`;

  // A bare hostname would otherwise be treated as a relative path and resolve
  // against the site's own origin.
  const origin = /^https?:\/\//.test(base) ? base : `https://${base}`;
  return `${origin}/${key}`;
}

export function slideUrl(
  cdnBaseUrl: string,
  talkId: string,
  version: number,
  slideNumber: number,
): string {
  return publicUrl(cdnBaseUrl, slideKey(talkId, version, slideNumber));
}

export function sourcePdfUrl(
  cdnBaseUrl: string,
  talkId: string,
  version: number,
): string {
  return publicUrl(cdnBaseUrl, sourcePdfKey(talkId, version));
}

async function listKeys(bucket: R2Bucket, prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let cursor: string | undefined;

  do {
    const listed = await bucket.list({ prefix, cursor });
    keys.push(...listed.objects.map((object) => object.key));
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);

  return keys;
}

async function deleteKeys(bucket: R2Bucket, keys: string[]): Promise<void> {
  // R2 accepts at most 1000 keys per delete call.
  for (let i = 0; i < keys.length; i += 1000) {
    await bucket.delete(keys.slice(i, i + 1000));
  }
}

/** Removes every deck version belonging to a talk. */
export async function deleteTalkObjects(
  bucket: R2Bucket,
  talkId: string,
): Promise<void> {
  await deleteKeys(bucket, await listKeys(bucket, `talks/${talkId}/`));
}

/**
 * Removes every deck version other than the one now live, cleaning up both the
 * deck that was just replaced and any half-finished upload.
 */
export async function deleteOtherVersions(
  bucket: R2Bucket,
  talkId: string,
  liveVersion: number,
): Promise<void> {
  const live = `${versionPrefix(talkId, liveVersion)}/`;
  const stale = (await listKeys(bucket, `talks/${talkId}/`)).filter(
    (key) => !key.startsWith(live),
  );
  await deleteKeys(bucket, stale);
}
