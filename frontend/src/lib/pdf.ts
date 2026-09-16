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
