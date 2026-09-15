import { type OcrProvider, type ProgresoDeOcr } from './ocr-provider';

export const TIPOS_DE_CSV = ['text/csv', 'application/vnd.ms-excel', 'text/plain'];

/**
 * Lectura de un CSV.
 *
 * Implementa `OcrProvider` aunque aquí no haya reconocimiento de nada: lo que
 * la interfaz representa es "sacar texto de un documento", y un CSV es el caso
 * trivial de eso. Reutilizarla evita duplicar la zona de arrastre, el progreso
 * y el manejo de errores, y deja el punto de extensión intacto.
 *
 * Lo hace explícito su propio nombre: `csv`, no `ocr-algo`. Quien lea el lote
 * después sabrá que ese origen no pasó por ningún reconocimiento y que sus
 * datos son exactamente los del archivo.
 */
export class CsvTextProvider implements OcrProvider {
  readonly nombre = 'csv';
  readonly etiqueta = 'Lectura directa del CSV';
  readonly enviaElDocumentoFuera = false;

  puedeCon(archivo: File): boolean {
    // El tipo MIME de un .csv es un desastre entre sistemas: Windows lo marca
    // como application/vnd.ms-excel, algunos navegadores como text/plain y
    // otros lo dejan vacío. La extensión es la señal fiable.
    return TIPOS_DE_CSV.includes(archivo.type) || /\.(csv|tsv|txt)$/i.test(archivo.name);
  }

  async extraerTexto(
    archivo: File,
    onProgreso?: (progreso: ProgresoDeOcr) => void,
  ): Promise<string> {
    onProgreso?.({ avance: 0.5, etapa: 'Leyendo el archivo…' });

    const bytes = new Uint8Array(await archivo.arrayBuffer());
    const texto = decodificar(bytes);

    onProgreso?.({ avance: 1, etapa: 'Listo' });
    return texto;
  }
}

/**
 * Decodifica el archivo adivinando la codificación.
 *
 * ── Por qué no basta con `archivo.text()` ───────────────────────────────────
 * Ese método asume UTF-8. Excel en español guarda los CSV en Windows-1252, y
 * al leerlos como UTF-8 cada tilde se convierte en el carácter de reemplazo:
 * "Éxito" queda como "�xito" y "Peñalisa" como "Pe�alisa". Para un histórico de
 * años eso significa cientos de descripciones corruptas.
 *
 * La detección es directa: se intenta UTF-8 en modo estricto y, si falla o
 * aparecen caracteres de reemplazo, se reintenta como Windows-1252 — que es la
 * codificación de la que vienen prácticamente todos los CSV problemáticos en
 * esta región.
 */
export function decodificar(bytes: Uint8Array): string {
  // Marca de orden de bytes: si está, es UTF-8 y no hay nada que adivinar.
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3));
  }

  try {
    // `fatal` hace que lance en vez de insertar caracteres de reemplazo.
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}
