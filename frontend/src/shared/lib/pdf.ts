/**
 * pdf.js, cargado una sola vez y con su worker en su sitio.
 *
 * ── Por qué el worker se sirve del propio bundle ────────────────────────────
 * Un CDN externo rompería la CSP y, peor, haría que abrir un recibo dependiera
 * de un tercero. Si mañana ese CDN cambia de versión o se cae, los soportes
 * dejan de verse sin que nadie haya tocado nada aquí.
 *
 * ── Por qué está en un módulo y no en cada sitio que lo usa ─────────────────
 * Porque son dos —el OCR de las importaciones y las miniaturas de los
 * soportes— y la línea del worker es exactamente la clase de detalle que se
 * copia bien la primera vez y mal la segunda.
 */
type Pdfjs = typeof import('pdfjs-dist');

let cargando: Promise<Pdfjs> | null = null;

export function cargarPdfjs(): Promise<Pdfjs> {
  // La promesa se guarda, no el módulo: dos llamadas simultáneas —dos
  // miniaturas que empiezan a la vez— comparten la misma carga en vez de
  // pedir el bundle dos veces.
  cargando ??= import('pdfjs-dist').then((pdfjs) => {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.mjs',
      import.meta.url,
    ).toString();
    return pdfjs;
  });

  return cargando;
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
  const pdfjs = await cargarPdfjs();
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
