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
