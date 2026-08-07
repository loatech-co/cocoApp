import type { OcrProvider } from './ocr-provider';
import { PdfTextProvider } from './pdf-provider';
import { TesseractOcrProvider } from './tesseract-provider';

export type { OcrProvider, ProgresoDeOcr } from './ocr-provider';
export { TIPOS_ACEPTADOS, TIPOS_DE_IMAGEN, TIPO_PDF } from './ocr-provider';

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
const PROVEEDORES: OcrProvider[] = [new PdfTextProvider(), new TesseractOcrProvider()];

export function proveedorPara(archivo: File): OcrProvider | null {
  return PROVEEDORES.find((proveedor) => proveedor.puedeCon(archivo)) ?? null;
}

export function proveedoresDisponibles(): readonly OcrProvider[] {
  return PROVEEDORES;
}
