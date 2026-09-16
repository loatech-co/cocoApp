import { clasificar, type Lectura } from '@coco/lectura';

import { cargarPdfjs } from '@/lib/pdf';

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

export interface SoporteLeido {
  texto: string;
  fuente: 'texto-embebido' | 'ocr';
  lectura: Lectura;
}

export interface ProgresoDeLectura {
  avance: number;
  etapa: string;
}

/** Por debajo de esto, lo que dice tener el PDF no es el recibo. */
const MINIMO_DE_TEXTO = 20;

/**
 * El texto de un PDF, en líneas.
 *
 * Las líneas no son un detalle: la mitad de las reglas del monto miran QUÉ
 * DICE la línea donde está el número —si dice "total a pagar" o si dice
 * "NIT"—. pdf.js entrega fragmentos sueltos con sus coordenadas, así que se
 * reagrupan por altura: dos fragmentos a la misma Y son la misma línea.
 */
async function textoDelPdf(archivo: File, paginas = 2): Promise<string> {
  const pdfjs = await cargarPdfjs();
  const documento = await pdfjs.getDocument({ data: await archivo.arrayBuffer() }).promise;

  const lineas: string[] = [];

  for (let n = 1; n <= Math.min(paginas, documento.numPages); n += 1) {
    const pagina = await documento.getPage(n);
    const contenido = await pagina.getTextContent();

    const filas = new Map<number, { x: number; s: string }[]>();
    for (const item of contenido.items) {
      if (!('str' in item) || item.str.trim() === '') continue;
      const y = Math.round(item.transform[5]);
      if (!filas.has(y)) filas.set(y, []);
      filas.get(y)!.push({ x: item.transform[4], s: item.str });
    }

    for (const [, partes] of [...filas.entries()].sort((a, b) => b[0] - a[0])) {
      lineas.push(
        partes
          .sort((a, b) => a.x - b.x)
          .map((p) => p.s)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim(),
      );
    }
  }

  await documento.cleanup();
  return lineas.join('\n');
}

/**
 * La primera página de un PDF como imagen, para dárselas al OCR.
 *
 * A 2 de escala y no a 1: Tesseract lee mucho mejor con más píxeles, y el
 * coste de rasterizar una página más grande es despreciable al lado de lo que
 * tarda el reconocimiento.
 */
async function primeraPaginaComoImagen(archivo: File): Promise<Blob | null> {
  const pdfjs = await cargarPdfjs();
  const documento = await pdfjs.getDocument({ data: await archivo.arrayBuffer() }).promise;
  const pagina = await documento.getPage(1);
  const vista = pagina.getViewport({ scale: 2 });

  const lienzo = document.createElement('canvas');
  lienzo.width = vista.width;
  lienzo.height = vista.height;
  const contexto = lienzo.getContext('2d');
  if (!contexto) return null;

  await pagina.render({ canvas: lienzo, canvasContext: contexto, viewport: vista }).promise;
  await documento.cleanup();

  return new Promise((resolver) => lienzo.toBlob((b) => resolver(b), 'image/png'));
}

/** OCR. Se carga a demanda: son varios megas que casi nunca hacen falta. */
async function ocr(
  fuente: Blob,
  onProgreso?: (p: ProgresoDeLectura) => void,
): Promise<string> {
  const { createWorker } = await import('tesseract.js');
  onProgreso?.({ avance: 0.3, etapa: 'Preparando el lector…' });

  const worker = await createWorker('spa', undefined, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') {
        onProgreso?.({ avance: 0.4 + m.progress * 0.55, etapa: 'Leyendo el recibo…' });
      }
    },
  });

  try {
    const { data } = await worker.recognize(fuente as File);
    return data.text;
  } finally {
    await worker.terminate();
  }
}

/**
 * Lee un archivo y dice de qué es.
 *
 * `periodo` ayuda a elegir entre las varias fechas que trae un recibo —la de
 * expedición, la de vencimiento, la del próximo corte—: la buena es la que
 * cae en el mes del gasto.
 */
export async function leerSoporte(
  archivo: File,
  opciones: { periodo?: string; onProgreso?: (p: ProgresoDeLectura) => void } = {},
): Promise<SoporteLeido> {
  const { onProgreso } = opciones;
  const esPdf = archivo.type === 'application/pdf' || /\.pdf$/i.test(archivo.name);

  let texto = '';
  let fuente: 'texto-embebido' | 'ocr' = 'texto-embebido';

  if (esPdf) {
    onProgreso?.({ avance: 0.1, etapa: 'Abriendo el documento…' });
    try {
      texto = await textoDelPdf(archivo);
    } catch {
      texto = '';
    }

    if (texto.replace(/\s/g, '').length < MINIMO_DE_TEXTO) {
      // Un escaneo: el PDF es una foto con forma de documento.
      onProgreso?.({ avance: 0.2, etapa: 'Es un escaneo, hay que reconocerlo…' });
      const imagen = await primeraPaginaComoImagen(archivo);
      if (imagen) {
        texto = await ocr(imagen, onProgreso);
        fuente = 'ocr';
      }
    }
  } else {
    onProgreso?.({ avance: 0.2, etapa: 'Reconociendo la imagen…' });
    texto = await ocr(archivo, onProgreso);
    fuente = 'ocr';
  }

  onProgreso?.({ avance: 1, etapa: 'Listo' });

  return {
    texto,
    fuente,
    lectura: clasificar({
      texto,
      fuente,
      nombreDeArchivo: archivo.name.replace(/\.[a-z0-9]+$/i, ''),
      periodo: opciones.periodo,
    }),
  };
}
