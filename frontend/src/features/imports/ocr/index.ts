import { CsvTextProvider } from './csv-provider';
import type { OcrProvider } from './ocr-provider';
import { PdfTextProvider } from './pdf-provider';
import { TesseractOcrProvider } from './tesseract-provider';

export type { OcrProvider, ProgresoDeOcr } from './ocr-provider';
export { TIPOS_DE_IMAGEN, TIPO_PDF } from './ocr-provider';
export { TIPOS_DE_CSV } from './csv-provider';

/** Todo lo que se puede soltar en la pantalla de importación. */
export const TIPOS_ACEPTADOS = '.csv,.tsv,.txt,application/pdf,image/png,image/jpeg,image/webp,image/bmp';

/**
 * Proveedores disponibles, en orden de preferencia.
 *
 * El de PDF va primero a propósito: si el documento trae capa de texto, se lee
 * exacto y no hay reconocimiento que pueda equivocarse. Rasterizar un texto
 * perfecto para volver a adivinarlo sería absurdo.
 *
 * Este arreglo es el punto de extensión completo. El día que exista un
 * proveedor de servidor —OCR de mayor calidad como funcionalidad de pago—, se
 * añade aquí y nada más del módulo cambia. Eso es lo que compra la interfaz.
 */
const PROVEEDORES: OcrProvider[] = [
  // El CSV va primero: es la vía exacta, sin reconocimiento que pueda fallar.
  new CsvTextProvider(),
  new PdfTextProvider(),
  new TesseractOcrProvider(),
];

export function proveedorPara(archivo: File): OcrProvider | null {
  return PROVEEDORES.find((proveedor) => proveedor.puedeCon(archivo)) ?? null;
}

export function proveedoresDisponibles(): readonly OcrProvider[] {
  return PROVEEDORES;
}
