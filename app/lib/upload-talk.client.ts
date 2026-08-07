import { rasterizePdf } from "~/lib/pdf-to-images.client";

export interface UploadProgress {
  step: "creating" | "rendering" | "uploading" | "finishing";
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

  const { pdf } = input;

  onProgress({ step: "rendering", done: 0, total: 0 });
  const slides = await rasterizePdf(pdf, (done, total) =>
    onProgress({ step: "rendering", done, total }),
  );

  // Everything lands under the new version, so the live deck is untouched
  // until the finalize call below commits it.
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

  await putBinary(`/api/talks/${id}/v/${version}/source`, pdf, "application/pdf");

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
