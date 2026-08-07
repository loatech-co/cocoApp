import { TIPO_PDF, type OcrProvider, type ProgresoDeOcr } from './ocr-provider';

/**
 * Extracción de texto de un PDF, sin OCR.
 *
 * ── Por qué esto va antes que Tesseract ─────────────────────────────────────
 * Casi todos los extractos que un banco envía por correo son PDF con capa de
 * texto: las letras están ahí, exactas, y solo hay que leerlas. Pasarles OCR
 * sería rasterizar un texto perfecto para volver a adivinarlo con errores.
 *
 * Aquí no hay reconocimiento que pueda fallar: si el PDF trae texto, sale
 * íntegro. Si no lo trae —un extracto escaneado—, se devuelve vacío y la
 * pantalla ofrece convertirlo a imagen y pasarlo por Tesseract.
 *
 * Igual que Tesseract, se carga de forma diferida: pdf.js pesa, y quien no
 * importe un PDF no tiene por qué descargarlo.
 */
export class PdfTextProvider implements OcrProvider {
  readonly nombre = 'pdfjs';
  readonly etiqueta = 'Lectura directa del PDF';
  readonly enviaElDocumentoFuera = false;

  puedeCon(archivo: File): boolean {
    return archivo.type === TIPO_PDF;
  }

  async extraerTexto(
    archivo: File,
    onProgreso?: (progreso: ProgresoDeOcr) => void,
  ): Promise<string> {
    onProgreso?.({ avance: 0, etapa: 'Abriendo el PDF…' });

    const pdfjs = await import('pdfjs-dist');
    // El worker se sirve desde el propio bundle: un CDN externo rompería la
    // CSP y, peor, haría que abrir un extracto dependiera de un tercero.
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.mjs',
      import.meta.url,
    ).toString();

    try {
      const documento = await pdfjs.getDocument({ data: await archivo.arrayBuffer() }).promise;
      const paginas: string[] = [];

      for (let numero = 1; numero <= documento.numPages; numero += 1) {
        onProgreso?.({
          avance: numero / documento.numPages,
          etapa: `Leyendo página ${numero} de ${documento.numPages}…`,
        });

        const pagina = await documento.getPage(numero);
        const contenido = await pagina.getTextContent();
        paginas.push(reconstruirLineas(contenido.items));
      }

      // Libera el worker y los búferes de la página. Sin esto, importar varios
      // PDF seguidos deja memoria retenida hasta recargar la pestaña.
      await documento.cleanup();
      onProgreso?.({ avance: 1, etapa: 'Listo' });
      return paginas.join('\n');
    } catch {
      return '';
    }
  }
}

interface ItemDeTexto {
  str?: string;
  transform?: number[];
}

/**
 * Reconstruye las líneas visuales del PDF.
 *
 * pdf.js entrega fragmentos sueltos con sus coordenadas, no líneas: un
 * movimiento puede venir partido en cuatro trozos (fecha, comercio, monto,
 * saldo). Concatenarlos sin más produciría un chorro ilegible donde el parser
 * no distinguiría dónde acaba un movimiento y empieza el siguiente.
 *
 * Se agrupan por su coordenada vertical, que es lo que define una línea en la
 * página, y se ordenan por la horizontal para conservar el orden de columnas.
 */
function reconstruirLineas(items: unknown[]): string {
  const porAltura = new Map<number, { x: number; texto: string }[]>();

  for (const bruto of items) {
    const item = bruto as ItemDeTexto;
    const texto = item.str;
    if (!texto?.trim() || !item.transform) continue;

    const x = item.transform[4] ?? 0;
    const y = item.transform[5] ?? 0;
    // Se redondea porque dos fragmentos de la misma línea pueden diferir en
    // decimales de punto por el interlineado del tipo de letra.
    const fila = Math.round(y);

    const existente = porAltura.get(fila);
    if (existente) existente.push({ x, texto });
    else porAltura.set(fila, [{ x, texto }]);
  }

  return [...porAltura.entries()]
    // De arriba abajo: en PDF, mayor `y` es más arriba.
    .sort((a, b) => b[0] - a[0])
    .map(([, fragmentos]) =>
      fragmentos
        .sort((a, b) => a.x - b.x)
        .map((fragmento) => fragmento.texto.trim())
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter(Boolean)
    .join('\n');
}
