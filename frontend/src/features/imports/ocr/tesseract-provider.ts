import {
  TIPOS_DE_IMAGEN,
  type OcrProvider,
  type ProgresoDeOcr,
} from './ocr-provider';

/**
 * OCR de imágenes con Tesseract.js, íntegramente en el navegador.
 *
 * ── La carga es diferida a propósito ────────────────────────────────────────
 * Tesseract pesa varios megabytes entre el motor WASM y los datos del idioma.
 * Importarlo de forma estática lo metería en el paquete principal y toda la
 * app tardaría más en abrir — incluso para quien nunca importe un extracto.
 * Con `import()` dinámico, solo lo descarga quien de verdad va a usarlo.
 *
 * El idioma es español: el motor por defecto es inglés y confunde
 * sistemáticamente las tildes y la ñ de los comercios colombianos.
 */
/** Respeta el `base` de Vite, para que funcione también en un subdirectorio. */
const BASE = import.meta.env.BASE_URL;

export class TesseractOcrProvider implements OcrProvider {
  readonly nombre = 'tesseract';
  readonly etiqueta = 'Reconocimiento en tu dispositivo';
  readonly enviaElDocumentoFuera = false;

  puedeCon(archivo: File): boolean {
    return TIPOS_DE_IMAGEN.includes(archivo.type);
  }

  async extraerTexto(
    archivo: File,
    onProgreso?: (progreso: ProgresoDeOcr) => void,
  ): Promise<string> {
    onProgreso?.({ avance: 0, etapa: 'Preparando el reconocimiento…' });

    const { createWorker } = await import('tesseract.js');

    const worker = await createWorker('spa', undefined, {
      // Todo desde NUESTRO origen. Por defecto, tesseract.js se traería el
      // worker, el motor WASM y los datos del idioma de cdn.jsdelivr.net en
      // tiempo de ejecución: sería ejecutar en el navegador de la persona un
      // binario de un tercero que nunca pasó por el lockfile, y dejaría el
      // reconocimiento dependiendo de que ese CDN esté vivo.
      //
      // Los archivos los deja ahí `scripts/preparar-tesseract.mjs`.
      workerPath: `${BASE}tesseract/worker.min.js`,
      corePath: `${BASE}tesseract/core`,
      langPath: `${BASE}tesseract/lang`,
      logger: (mensaje: { status: string; progress: number }) => {
        onProgreso?.({
          avance: mensaje.progress,
          etapa: traducirEtapa(mensaje.status),
        });
      },
    });

    try {
      const { data } = await worker.recognize(archivo);
      onProgreso?.({ avance: 1, etapa: 'Listo' });
      return data.text ?? '';
    } catch {
      // Una imagen ilegible no es un error de programa: es un documento malo.
      // Se devuelve vacío y la capa de arriba lo cuenta.
      return '';
    } finally {
      // Sin esto queda un Web Worker vivo por cada importación, y el navegador
      // acaba quedándose sin memoria tras unas cuantas.
      await worker.terminate();
    }
  }
}

/** Los estados de Tesseract vienen en inglés y son bastante crípticos. */
function traducirEtapa(estado: string): string {
  const traducciones: Record<string, string> = {
    'loading tesseract core': 'Cargando el motor…',
    'initializing tesseract': 'Iniciando…',
    'loading language traineddata': 'Cargando el idioma…',
    'initializing api': 'Preparando…',
    'recognizing text': 'Leyendo el documento…',
  };
  return traducciones[estado] ?? 'Procesando…';
}
