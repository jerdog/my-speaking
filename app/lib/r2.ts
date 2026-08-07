export function slideKey(talkId: string, slideNumber: number): string {
  return `talks/${talkId}/slide-${slideNumber}.webp`;
}

export function sourcePdfKey(talkId: string): string {
  return `talks/${talkId}/source.pdf`;
}

/**
 * Slides are public, so they're served straight from an R2 custom domain when
 * one is configured. Without it they fall back to being streamed by the Worker,
 * which keeps local dev and a fresh deploy working before DNS is set up.
 */
function publicUrl(cdnBaseUrl: string, key: string): string {
  return cdnBaseUrl ? `${cdnBaseUrl.replace(/\/$/, "")}/${key}` : `/slides/${key}`;
}

export function slideUrl(
  cdnBaseUrl: string,
  talkId: string,
  slideNumber: number,
): string {
  return publicUrl(cdnBaseUrl, slideKey(talkId, slideNumber));
}

export function sourcePdfUrl(cdnBaseUrl: string, talkId: string): string {
  return publicUrl(cdnBaseUrl, sourcePdfKey(talkId));
}

async function listTalkKeys(
  bucket: R2Bucket,
  talkId: string,
): Promise<string[]> {
  const keys: string[] = [];
  let cursor: string | undefined;

  do {
    const listed = await bucket.list({ prefix: `talks/${talkId}/`, cursor });
    keys.push(...listed.objects.map((object) => object.key));
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);

  return keys;
}

/** Removes every slide image and the source PDF for a talk. */
export async function deleteTalkObjects(
  bucket: R2Bucket,
  talkId: string,
): Promise<void> {
  const keys = await listTalkKeys(bucket, talkId);
  if (keys.length > 0) {
    await bucket.delete(keys);
  }
}

/**
 * Drops slide images past `slideCount`, so replacing a deck with a shorter one
 * doesn't leave the trailing slides of the old deck behind in the bucket.
 */
export async function deleteSlidesAfter(
  bucket: R2Bucket,
  talkId: string,
  slideCount: number,
): Promise<void> {
  const stale = (await listTalkKeys(bucket, talkId)).filter((key) => {
    const match = key.match(/\/slide-(\d+)\.webp$/);
    return match !== null && Number(match[1]) > slideCount;
  });

  if (stale.length > 0) {
    await bucket.delete(stale);
  }
}
