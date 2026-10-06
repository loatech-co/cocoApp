/**
 * pdf.js, loaded only once and with its worker in place.
 *
 * ── Why the worker is served from our own bundle ────────────────────────────
 * An external CDN would break the CSP and, worse, would make opening a
 * receipt depend on a third party. If tomorrow that CDN changes version or
 * goes down, receipts stop showing without anyone having touched anything
 * here.
 *
 * ── Why it is in a module and not in every place that uses it ───────────────
 * Because there are two —the OCR of the imports and the receipt thumbnails—
 * and the worker line is exactly the kind of detail that gets copied right
 * the first time and wrong the second.
 */
type Pdfjs = typeof import('pdfjs-dist');

let loading: Promise<Pdfjs> | null = null;

export function loadPdfjs(): Promise<Pdfjs> {
  // The promise is kept, not the module: two simultaneous calls —two
  // thumbnails starting at once— share the same load instead of asking for
  // the bundle twice.
  loading ??= import('pdfjs-dist').then((pdfjs) => {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.mjs',
      import.meta.url,
    ).toString();
    return pdfjs;
  });

  return loading;
}

/** What a page drawing ended with: the drawn size in pixels. */
export interface PdfPageDrawing {
  width: number;
  height: number;
}

/**
 * Draws one page of a PDF on a canvas.
 *
 * The first-page thumbnail and the page of the full-screen viewer drew it
 * line by line the same way. Returns `null` when it stopped halfway —the
 * caller went away (`isAlive`), the canvas is gone or it has no 2D context—
 * so the caller never reports a drawing that did not happen. Errors are
 * thrown: each caller decides what a broken PDF looks like.
 */
export async function drawPdfPage({
  url,
  page,
  scale,
  canvas,
  isAlive,
  onPages,
}: {
  url: string;
  page: number;
  /** The scale to draw at, given the page's natural width. */
  scale: (pageWidth: number) => number;
  canvas: () => HTMLCanvasElement | null;
  isAlive: () => boolean;
  /** Called with the page count as soon as the document opens. */
  onPages?: (pages: number) => void;
}): Promise<PdfPageDrawing | null> {
  const pdfjs = await loadPdfjs();
  const document = await pdfjs.getDocument({ url }).promise;
  if (onPages) {
    if (!isAlive()) return null;
    onPages(document.numPages);
  }

  const sheet = await document.getPage(Math.min(page, document.numPages));
  const target = canvas();
  if (!isAlive() || !target) return null;

  const base = sheet.getViewport({ scale: 1 });
  const view = sheet.getViewport({ scale: scale(base.width) });

  const context = target.getContext('2d');
  if (!context) return null;

  target.width = view.width;
  target.height = view.height;

  await sheet.render({ canvas: target, canvasContext: context, viewport: view }).promise;
  await document.cleanup();
  return { width: view.width, height: view.height };
}
