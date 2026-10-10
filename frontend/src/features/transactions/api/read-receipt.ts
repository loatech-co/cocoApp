import { ApiClientError } from '@/shared/api/api-client';
import { interpretationInterpret } from '@/shared/api/generated/interpretation-v2/interpretation-v2';
import type { Interpretation } from '@/shared/api/generated/model';
import { t } from '@/shared/lib/i18n';
import { loadPdfjs } from '@/shared/lib/pdf';
import type { Reading } from '@coco/receipt-parser';

/**
 * Reading a receipt: extracting its text and, with it, what it is for.
 *
 * ── Why in the browser and not on the server ────────────────────────────────
 * It is the same decision the statement importer already made, for the same
 * three reasons: the document does not leave the device while it is read, the OCR does not
 * cost a cent, and each person brings their own CPU —which is the only way
 * for this to scale on a shared plan where not even tesseract is installed—.
 *
 * ── The cascade ─────────────────────────────────────────────────────────────
 * First the PDF's embedded text: it is exact and takes milliseconds. Almost
 * every utility receipt is digital and carries it. Only when there is no
 * text —a scan, a photo— does the OCR fire up, which takes seconds and gets
 * letters wrong. The order matters: the other way around, every digital receipt would pay
 * the price of the worst case.
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

/** Below this, what the PDF claims to have is not the receipt. */
const MIN_TEXT_LENGTH = 20;

/**
 * The text of a PDF, in lines.
 *
 * The lines are not a detail: half of the amount rules look at WHAT
 * THE LINE SAYS where the number is —whether it says "total a pagar" or
 * "NIT"—. pdf.js hands over loose fragments with their coordinates, so they are
 * regrouped by height: two fragments at the same Y are the same line.
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
      // `transform` arrives untyped from pdfjs. It is the PDF 6-number
      // matrix: the last two positions are the offset, x and then y.
      // All six positions are always there: the defaults are not used.
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
 * The first page of a PDF as an image, to hand it to the OCR.
 *
 * At scale 2 and not 1: Tesseract reads much better with more pixels, and the
 * cost of rasterizing a larger page is negligible next to how long
 * the recognition takes.
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

/** OCR. Loaded on demand: it is several megabytes that are almost never needed. */
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
 * Reads a file and says what it is for.
 *
 * ── The OCR here; the interpretation, in the API ────────────────────────────
 * Extracting the text is still the browser's job —the document does not leave the
 * device while it is read, and each person brings their CPU—. But what that text
 * MEANS is decided by the server: `/transactions/interpret` has the person's
 * tree, their history and the dictionary, and it is the only place where the
 * rules change. Before, it was classified here with a copy of those rules, and the
 * phone app would have needed another one.
 *
 * `period` helps pick among the several dates a receipt carries —the
 * issue date, the due date, the next cutoff—: the right one is the one that
 * falls in the month of the expense.
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

/** The file's text: the one a PDF carries inside, or the one the OCR recognizes. */
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
    // A scan: the PDF is a photo shaped like a document.
    onProgress?.({ progress: 0.2, stage: t('transactions.reading.stages.scan') });
    const image = await firstPageAsImage(file);
    if (image) return { text: await ocr(image, onProgress), source: 'ocr' };
  }

  return { text, source: 'texto-embebido' };
}

/** What the server understands of the text. */
async function interpretText(
  text: string,
  file: File,
  period: string | undefined,
): Promise<Interpretation> {
  try {
    const response = await interpretationInterpret({
      text,
      fileName: file.name.replace(/\.[a-z0-9]+$/i, ''),
      ...(period === undefined ? {} : { period }),
    });
    return response.data;
  } catch (e) {
    // The file is already attached; what failed is understanding it. It is said that way, and
    // whoever reads it types the data by hand in the same sheet.
    const detail = e instanceof ApiClientError ? ` (${e.message})` : '';
    throw new Error(t('transactions.reading.serverFailed', { detail }), { cause: e });
  }
}

/**
 * The server's response, in the shape the sheet already understands.
 *
 * `Reading` is what the sheet consumed when it was classified here; keeping
 * the shape leaves the sheet the same and only changes where the decision comes from. The
 * confidence is translated from the certainty: high without review is certain; the rest,
 * below the threshold, so that the sheet says so.
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
            certainty: c.certainty,
            source: c.source ?? 'dictionary',
            conceptId: c.conceptId ?? undefined,
            categoryId: c.categoryId ?? undefined,
            candidates: c.candidates.map((k) => ({ id: k.id, name: k.name, path: k.path })),
          },
  };
}
