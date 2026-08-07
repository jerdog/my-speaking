import { rasterizePdf } from "~/lib/pdf-to-images.client";

export interface UploadProgress {
  step: "creating" | "rendering" | "uploading" | "finishing";
  done: number;
  total: number;
}

export interface UploadTalkInput {
  metadata: Record<string, string>;
  pdf: File;
  talkId?: string;
}

export async function uploadTalk(
  { metadata, pdf, talkId }: UploadTalkInput,
  onProgress: (progress: UploadProgress) => void,
): Promise<{ slug: string }> {
  let id = talkId;

  if (!id) {
    onProgress({ step: "creating", done: 0, total: 0 });
    const created = await postJson("/api/talks", "POST", metadata);
    id = created.id as string;
  }

  onProgress({ step: "rendering", done: 0, total: 0 });
  const slides = await rasterizePdf(pdf, (done, total) =>
    onProgress({ step: "rendering", done, total }),
  );

  for (const slide of slides) {
    await putBinary(
      `/api/talks/${id}/slides/${slide.pageNumber}`,
      slide.blob,
      "image/webp",
    );
    onProgress({
      step: "uploading",
      done: slide.pageNumber,
      total: slides.length,
    });
  }

  await putBinary(`/api/talks/${id}/source`, pdf, "application/pdf");

  onProgress({ step: "finishing", done: slides.length, total: slides.length });
  const finished = await postJson(`/api/talks/${id}`, "PATCH", {
    slideCount: slides.length,
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
