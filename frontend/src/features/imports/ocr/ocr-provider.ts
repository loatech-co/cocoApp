/**
 * Contrato de extracción de texto.
 *
 * ── Por qué existe esta interfaz ────────────────────────────────────────────
 * Es el único ajuste de diseño que salió del análisis de arquitectura (5.6).
 * Hoy todo el reconocimiento ocurre en el navegador: privacidad (el extracto
 * nunca sale del equipo), costo cero (no se paga OCR en la nube) y escala
 * implícita (cada usuario aporta su propia CPU).
 *
 * Pero el día que Coco valga la pena venderse, un plan de pago podría ofrecer
 * OCR de servidor de mayor calidad. Si el pipeline llamara a Tesseract
 * directamente, añadir esa opción sería reescribir el módulo. Llamando a esta
 * interfaz, es enchufar una implementación nueva.
 *
 * Lo que un proveedor NUNCA puede hacer: subir el documento a ninguna parte sin
 * que la persona lo sepa. Un proveedor de servidor tendría que anunciarlo con
 * `enviaElDocumentoFuera: true`, y la interfaz lo advertiría antes de usarlo.
 */

export interface ProgresoDeOcr {
  /** 0–1. */
  avance: number;
  /** Qué está pasando, en español y legible. */
  etapa: string;
}

export interface OcrProvider {
  /** Identificador estable. Se guarda en el lote para poder comparar calidad. */
  readonly nombre: string;
  /** Cómo se llama en pantalla. */
  readonly etiqueta: string;
  /**
   * Si el documento sale del equipo. Hoy siempre `false`. Una implementación
   * de servidor tendría que ponerlo en `true`, y la interfaz avisaría.
   */
  readonly enviaElDocumentoFuera: boolean;

  puedeCon(archivo: File): boolean;

  /**
   * Devuelve el texto crudo. Nunca lanza por un documento ilegible: devuelve
   * cadena vacía y deja que la capa de arriba lo cuente.
   */
  extraerTexto(archivo: File, onProgreso?: (progreso: ProgresoDeOcr) => void): Promise<string>;
}

export const TIPOS_DE_IMAGEN = ['image/png', 'image/jpeg', 'image/webp', 'image/bmp'];
export const TIPO_PDF = 'application/pdf';

/** Todo lo que se puede soltar en la pantalla de importación. */
export const TIPOS_ACEPTADOS = [...TIPOS_DE_IMAGEN, TIPO_PDF].join(',');
