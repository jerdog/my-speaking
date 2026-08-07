const TARGET_SLIDE_WIDTH = 1600;
const WEBP_QUALITY = 0.85;

export interface RasterizedSlide {
  pageNumber: number;
  blob: Blob;
}

/**
 * Renders each page of a PDF to a WebP image in the browser. Workers can't run
 * a PDF renderer, so conversion happens client-side at upload time.
 */
export async function rasterizePdf(
  file: File,
  onProgress: (done: number, total: number) => void,
): Promise<RasterizedSlide[]> {
  // The legacy build is transpiled and polyfilled; the modern one relies on
  // JS features that Safari and older Chrome/Firefox don't have yet.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const workerSrc = (
    await import("pdfjs-dist/legacy/build/pdf.worker.mjs?url")
  ).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

  const data = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data });
  const doc = await loadingTask.promise;

  const slides: RasterizedSlide[] = [];
  const canvas = document.createElement("canvas");

  try {
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      const baseViewport = page.getViewport({ scale: 1 });
      const scale = TARGET_SLIDE_WIDTH / baseViewport.width;
      const viewport = page.getViewport({ scale });

      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);

      await page.render({ canvas, viewport }).promise;
      page.cleanup();

      slides.push({ pageNumber, blob: await toWebp(canvas) });
      onProgress(pageNumber, doc.numPages);
    }
  } finally {
    await loadingTask.destroy();
  }

  return slides;
}

function toWebp(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Failed to encode slide image")),
      "image/webp",
      WEBP_QUALITY,
    );
  });
}
