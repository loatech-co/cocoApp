import { ApiClientError } from '@/shared/api/api-client';
import { interpretacionInterpret } from '@/shared/api/generated/interpretacion-v2/interpretacion-v2';
import type { ClassificationSource, Interpretation } from '@/shared/api/generated/model';
import { t } from '@/shared/lib/i18n';
import { loadPdfjs } from '@/shared/lib/pdf';
import type { TreeClassification, Reading } from '@coco/receipt-parser';

/**
 * Leer un recibo: sacarle el texto y, con él, de qué es.
 *
 * ── Por qué en el navegador y no en el servidor ─────────────────────────────
 * Es la misma decisión que ya tomó el importador de extractos, por las mismas
 * tres razones: el documento no sale del equipo mientras se lee, el OCR no
 * cuesta un peso, y cada persona pone su propia CPU —que es la única forma de
 * que esto escale en un plan compartido donde no hay ni tesseract instalado—.
 *
 * ── La cascada ──────────────────────────────────────────────────────────────
 * Primero el texto embebido del PDF: es exacto y tarda milisegundos. Casi
 * todos los recibos de servicios son digitales y lo traen. Solo cuando no hay
 * texto —un escaneo, una foto— se enciende el OCR, que tarda segundos y se
 * equivoca de letra. El orden importa: al revés, cada recibo digital pagaría
 * el precio del peor caso.
 */

export interface ParsedReceipt {
  text: string;
  source: 'texto-embebido' | 'ocr';
  reading: Reading;
}

export interface ReadingProgress {
  progress: number;
  stage: string;
}

/** Por debajo de esto, lo que dice tener el PDF no es el recibo. */
const MIN_TEXT_LENGTH = 20;

/**
 * El texto de un PDF, en líneas.
 *
 * Las líneas no son un detalle: la mitad de las reglas del monto miran QUÉ
 * DICE la línea donde está el número —si dice "total a pagar" o si dice
 * "NIT"—. pdf.js entrega fragmentos sueltos con sus coordenadas, así que se
 * reagrupan por altura: dos fragmentos a la misma Y son la misma línea.
 */
async function pdfText(file: File, pages = 2): Promise<string> {
  const pdfjs = await loadPdfjs();
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;

  const lines: string[] = [];

  for (let n = 1; n <= Math.min(pages, pdf.numPages); n += 1) {
    const page = await pdf.getPage(n);
    const content = await page.getTextContent();

    const rows = new Map<number, { x: number; s: string }[]>();
    for (const item of content.items) {
      if (!('str' in item) || item.str.trim() === '') continue;
      // `transform` llega sin tipar desde pdfjs. Es la matriz de 6 números de
      // PDF: las dos últimas posiciones son el desplazamiento, x y luego y.
      // Las seis posiciones están siempre: los valores por defecto no se usan.
      const [, , , , x = 0, y = 0] = item.transform as number[];
      const lineY = Math.round(y);
      const row = rows.get(lineY);
      if (row) row.push({ x, s: item.str });
      else rows.set(lineY, [{ x, s: item.str }]);
    }

    for (const [, partes] of [...rows.entries()].sort((a, b) => b[0] - a[0])) {
      lines.push(
        partes
          .sort((a, b) => a.x - b.x)
          .map((p) => p.s)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim(),
      );
    }
  }

  await pdf.cleanup();
  return lines.join('\n');
}

/**
 * La primera página de un PDF como imagen, para dárselas al OCR.
 *
 * A 2 de escala y no a 1: Tesseract lee mucho mejor con más píxeles, y el
 * coste de rasterizar una página más grande es despreciable al lado de lo que
 * tarda el reconocimiento.
 */
async function firstPageAsImage(file: File): Promise<Blob | null> {
  const pdfjs = await loadPdfjs();
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const page = await pdf.getPage(1);
  const vista = page.getViewport({ scale: 2 });

  const canvas = document.createElement('canvas');
  canvas.width = vista.width;
  canvas.height = vista.height;
  const context = canvas.getContext('2d');
  if (!context) return null;

  await page.render({ canvas, canvasContext: context, viewport: vista }).promise;
  await pdf.cleanup();

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
}

/**
 * Where the OCR engine comes from: our own origin, never a CDN.
 *
 * By default `tesseract.js` downloads its worker, its WASM core and the
 * language data from jsDelivr at run time. `scripts/preparar-tesseract.mjs`
 * already leaves all three in `public/tesseract/` (copied from node_modules,
 * so the lockfile vouches for them), and these paths point there. A strict
 * CSP would block the CDN anyway, and the receipt being read is nobody
 * else's business.
 *
 * - `workerBlobURL: false` loads the worker straight from its URL instead of
 *   wrapping it in a `blob:` URL, which the CSP would also have to allow.
 * - `gzip: false` because the script downloads `spa.traineddata` raw, not
 *   the `.gz` the CDN serves.
 * - The URLs are absolute: the core and the language data are fetched from
 *   inside the worker, where a relative path would resolve against the
 *   worker's own script and not against the page.
 */
export function ocrPaths(origin: string = window.location.href) {
  const base = new URL(`${import.meta.env.BASE_URL}tesseract/`, origin).href;
  return {
    workerPath: `${base}worker.min.js`,
    corePath: `${base}core`,
    langPath: `${base}lang`,
    gzip: false,
    workerBlobURL: false,
  };
}

/** OCR. Se carga a demanda: son varios megas que casi nunca hacen falta. */
async function ocr(source: Blob, onProgress?: (p: ReadingProgress) => void): Promise<string> {
  const { createWorker } = await import('tesseract.js');
  onProgress?.({ progress: 0.3, stage: t('transactions.reading.stages.preparing') });

  const worker = await createWorker('spa', undefined, {
    ...ocrPaths(),
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') {
        onProgress?.({
          progress: 0.4 + m.progress * 0.55,
          stage: t('transactions.reading.stages.recognizingText'),
        });
      }
    },
  });

  try {
    const { data } = await worker.recognize(source);
    return data.text;
  } finally {
    await worker.terminate();
  }
}

/**
 * Lee un archivo y dice de qué es.
 *
 * ── El OCR aquí; la interpretación, en la API ───────────────────────────────
 * Sacar el texto sigue siendo cosa del navegador —el documento no sale del
 * equipo mientras se lee, y cada persona pone su CPU—. Pero lo que ese texto
 * SIGNIFICA lo decide el servidor: `/transactions/interpret` tiene el árbol de
 * la persona, su historial y el diccionario, y es el único sitio donde cambian
 * las reglas. Antes se clasificaba aquí con una copia de esas reglas, y la app
 * del teléfono habría necesitado otra.
 *
 * `periodo` ayuda a elegir entre las varias fechas que trae un recibo —la de
 * expedición, la de vencimiento, la del próximo corte—: la buena es la que
 * cae en el mes del gasto.
 */
export async function readReceipt(
  file: File,
  options: {
    period?: string;
    onProgress?: (p: ReadingProgress) => void;
  } = {},
): Promise<ParsedReceipt> {
  const { onProgress } = options;
  const { text, source } = await extractText(file, onProgress);

  onProgress?.({ progress: 0.9, stage: t('transactions.reading.stages.interpreting') });
  const interpretation = await interpretText(text, file, options.period);
  onProgress?.({ progress: 1, stage: t('transactions.reading.stages.done') });

  return { text, source, reading: readingFrom(interpretation, source) };
}

/** El texto del archivo: el que trae dentro un PDF, o el que reconoce el OCR. */
async function extractText(
  file: File,
  onProgress: ((p: ReadingProgress) => void) | undefined,
): Promise<{ text: string; source: 'texto-embebido' | 'ocr' }> {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);

  if (!isPdf) {
    onProgress?.({ progress: 0.2, stage: t('transactions.reading.stages.recognizingImage') });
    return { text: await ocr(file, onProgress), source: 'ocr' };
  }

  onProgress?.({ progress: 0.1, stage: t('transactions.reading.stages.openingDocument') });
  let text: string;
  try {
    text = await pdfText(file);
  } catch {
    text = '';
  }

  if (text.replace(/\s/g, '').length < MIN_TEXT_LENGTH) {
    // Un escaneo: el PDF es una foto con forma de documento.
    onProgress?.({ progress: 0.2, stage: t('transactions.reading.stages.scan') });
    const image = await firstPageAsImage(file);
    if (image) return { text: await ocr(image, onProgress), source: 'ocr' };
  }

  return { text, source: 'texto-embebido' };
}

/** Lo que el servidor entiende del texto. */
async function interpretText(
  text: string,
  file: File,
  period: string | undefined,
): Promise<Interpretation> {
  try {
    const response = await interpretacionInterpret({
      text,
      fileName: file.name.replace(/\.[a-z0-9]+$/i, ''),
      ...(period === undefined ? {} : { period }),
    });
    return response.data;
  } catch (e) {
    // El archivo ya está adjunto; lo que falló es entenderlo. Se dice así, y
    // quien lo lee escribe los datos a mano en la misma ficha.
    const detail = e instanceof ApiClientError ? ` (${e.message})` : '';
    throw new Error(t('transactions.reading.serverFailed', { detail }), { cause: e });
  }
}

/**
 * La respuesta del servidor, con la forma que la ficha ya entiende.
 *
 * `Lectura` es lo que la ficha consumía cuando se clasificaba aquí; mantener
 * la forma deja la ficha igual y cambia solo de dónde viene la decisión. La
 * confianza se traduce de la certeza: alta sin revisar es seguro; lo demás,
 * por debajo del umbral, para que la ficha lo diga.
 */
function readingFrom(i: Interpretation, source: 'texto-embebido' | 'ocr'): Reading {
  const c = i.classification;
  return {
    concept: c.conceptId !== null ? c.name : null,
    category: c.conceptId === null && c.categoryId !== null ? c.name : null,
    costCenter: null,
    value: i.amount === null ? null : Number(i.amount),
    date: i.date,
    confidence: !i.needsReview
      ? source === 'ocr'
        ? 0.85
        : 0.95
      : c.certainty === 'high'
        ? 0.7
        : c.certainty === 'medium'
          ? 0.5
          : 0.2,
    signals: { text: [], name: [], nit: [], ignoredCollectors: [] },
    reason: c.reason,
    alternatives: c.candidates.map((k) => ({ concept: k.name, score: 0 })),
    inTree:
      c.certainty === 'none'
        ? null
        : {
            certainty: c.certainty === 'high' ? 'alta' : 'media',
            source: PARSER_SOURCE[c.source ?? 'dictionary'],
            conceptId: c.conceptId ?? undefined,
            categoryId: c.categoryId ?? undefined,
            candidates: c.candidates.map((k) => ({ id: k.id, name: k.name, path: k.path })),
          },
  };
}

/**
 * The API speaks English (v2); `@coco/receipt-parser`, which the sheet reads, still
 * names its sources in Spanish. Translated here, at the edge.
 */
const PARSER_SOURCE: Record<NonNullable<ClassificationSource>, TreeClassification['source']> = {
  history: 'historial',
  keywords: 'palabras-clave',
  signature: 'firma',
  dictionary: 'diccionario',
};
