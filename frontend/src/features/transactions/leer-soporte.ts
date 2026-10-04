import type { Lectura } from '@coco/lectura';
import type { Interpretacion } from '@coco/types';

import { ApiClientError, apiFetch } from '@/lib/api-client';
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
      // `transform` llega sin tipar desde pdfjs. Es la matriz de 6 números de
      // PDF: las dos últimas posiciones son el desplazamiento, x y luego y.
      const [, , , , x, y] = item.transform as number[];
      const renglon = Math.round(y);
      if (!filas.has(renglon)) filas.set(renglon, []);
      filas.get(renglon)!.push({ x, s: item.str });
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
  onProgreso?.({ avance: 0.3, etapa: 'Preparando el reconocimiento…' });

  const worker = await createWorker('spa', undefined, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') {
        onProgreso?.({ avance: 0.4 + m.progress * 0.55, etapa: 'Reconociendo el texto…' });
      }
    },
  });

  try {
    const { data } = await worker.recognize(fuente);
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
export async function leerSoporte(
  archivo: File,
  opciones: {
    periodo?: string;
    onProgreso?: (p: ProgresoDeLectura) => void;
  } = {},
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
      onProgreso?.({ avance: 0.2, etapa: 'Es un escaneo: se reconoce el texto…' });
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

  onProgreso?.({ avance: 0.9, etapa: 'Interpretando…' });

  let interpretacion: Interpretacion;
  try {
    const respuesta = await apiFetch<Interpretacion>('/transactions/interpret', {
      method: 'POST',
      body: {
        texto,
        nombre_de_archivo: archivo.name.replace(/\.[a-z0-9]+$/i, ''),
        periodo: opciones.periodo,
      },
    });
    interpretacion = respuesta.data;
  } catch (e) {
    // El archivo ya está adjunto; lo que falló es entenderlo. Se dice así, y
    // quien lo lee escribe los datos a mano en la misma ficha.
    const detalle = e instanceof ApiClientError ? ` (${e.message})` : '';
    throw new Error(
      `No se pudo interpretar el soporte en el servidor${detalle}. Escribe los datos a mano; el archivo queda adjunto al movimiento.`,
    );
  }

  onProgreso?.({ avance: 1, etapa: 'Listo' });

  return { texto, fuente, lectura: lecturaDesde(interpretacion, fuente) };
}

/**
 * La respuesta del servidor, con la forma que la ficha ya entiende.
 *
 * `Lectura` es lo que la ficha consumía cuando se clasificaba aquí; mantener
 * la forma deja la ficha igual y cambia solo de dónde viene la decisión. La
 * confianza se traduce de la certeza: alta sin revisar es seguro; lo demás,
 * por debajo del umbral, para que la ficha lo diga.
 */
function lecturaDesde(i: Interpretacion, fuente: 'texto-embebido' | 'ocr'): Lectura {
  const c = i.clasificacion;
  return {
    concepto: c.concepto_id !== null ? c.nombre : null,
    categoria: c.concepto_id === null && c.categoria_id !== null ? c.nombre : null,
    centro: null,
    valor: i.amount === null ? null : Number(i.amount),
    fecha: i.date,
    confianza: !i.por_revisar ? (fuente === 'ocr' ? 0.85 : 0.95) : c.certeza === 'alta' ? 0.7 : c.certeza === 'media' ? 0.5 : 0.2,
    señales: { texto: [], nombre: [], nit: [], recaudadoresIgnorados: [] },
    motivo: c.motivo,
    alternativas: c.candidatos.map((k) => ({ concepto: k.nombre, puntaje: 0 })),
    enElArbol:
      c.certeza === 'ninguna'
        ? null
        : {
            certeza: c.certeza,
            fuente: c.fuente ?? 'diccionario',
            conceptoId: c.concepto_id ?? undefined,
            categoriaId: c.categoria_id ?? undefined,
            candidatos: c.candidatos.map((k) => ({ id: k.id, nombre: k.nombre, ruta: k.ruta })),
          },
  };
}
