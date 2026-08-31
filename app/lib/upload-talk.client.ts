import { rasterizePdf } from "~/lib/pdf-to-images.client";

export interface UploadProgress {
  step: "creating" | "fetching" | "rendering" | "uploading" | "finishing";
  done: number;
  total: number;
}

export type UploadTalkInput =
  | { mode: "create"; metadata: Record<string, string>; pdf: File }
  | { mode: "replace"; talkId: string; uploadVersion: number; pdf: File };

export async function uploadTalk(
  input: UploadTalkInput,
  onProgress: (progress: UploadProgress) => void,
): Promise<{ slug: string }> {
  let id: string;
  let version: number;

  if (input.mode === "create") {
    onProgress({ step: "creating", done: 0, total: 0 });
    const created = await postJson("/api/talks", "POST", input.metadata);
    id = created.id as string;
    version = created.uploadVersion as number;
  } else {
    id = input.talkId;
    version = input.uploadVersion;
  }

  await putBinary(
    `/api/talks/${id}/v/${version}/source`,
    input.pdf,
    "application/pdf",
  );

  return renderAndPublish(id, version, input.pdf, onProgress);
}

/**
 * Pulls a deck straight from an external URL: the Worker stores it, then it is
 * read back here to be rasterized, since only the browser can render a PDF.
 */
export async function importDeckFromUrl(
  {
    talkId,
    uploadVersion,
    url,
  }: { talkId: string; uploadVersion: number; url?: string },
  onProgress: (progress: UploadProgress) => void,
): Promise<{ slug: string }> {
  onProgress({ step: "fetching", done: 0, total: 0 });
  // With no url the server falls back to the deck recorded at import time.
  await postJson(
    `/api/talks/${talkId}/v/${uploadVersion}/import-source`,
    "POST",
    url ? { url } : {},
  );

  const stored = await fetch(`/api/talks/${talkId}/v/${uploadVersion}/source`);
  if (!stored.ok) throw new Error(await errorMessage(stored));
  const pdf = await stored.blob();

  return renderAndPublish(talkId, uploadVersion, pdf, onProgress);
}

/**
 * Rasterizes a deck and commits it. Everything lands under the new version, so
 * the live deck is untouched until the finalize call at the end.
 */
async function renderAndPublish(
  id: string,
  version: number,
  pdf: Blob,
  onProgress: (progress: UploadProgress) => void,
): Promise<{ slug: string }> {
  onProgress({ step: "rendering", done: 0, total: 0 });
  const slides = await rasterizePdf(pdf, (done, total) =>
    onProgress({ step: "rendering", done, total }),
  );

  for (const slide of slides) {
    await putBinary(
      `/api/talks/${id}/v/${version}/slides/${slide.pageNumber}`,
      slide.blob,
      "image/webp",
    );
    onProgress({
      step: "uploading",
      done: slide.pageNumber,
      total: slides.length,
    });
  }

  onProgress({ step: "finishing", done: slides.length, total: slides.length });
  const finished = await postJson(`/api/talks/${id}`, "PATCH", {
    slideCount: slides.length,
    uploadVersion: version,
  });

  return { slug: finished.slug as string };
}

async function postJson(
  url: string,
  method: string,
  body: unknown,
): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(await errorMessage(response));
  }
  return response.json();
}

async function putBinary(url: string, body: Blob, contentType: string) {
  const response = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body,
  });
  if (!response.ok) {
    throw new Error(await errorMessage(response));
  }
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    if (body.error) return body.error;
  } catch {
    // fall through to the status text
  }
  return `${response.status} ${response.statusText}`;
}
