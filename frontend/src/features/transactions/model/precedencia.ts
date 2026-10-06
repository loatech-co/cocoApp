import { t } from '@/shared/lib/i18n';
/**
 * De dónde salió la clasificación de un movimiento, y quién puede cambiarla.
 *
 * ── Las cuatro fuentes, de mayor a menor ────────────────────────────────────
 * 1. Lo que la persona elige a mano.
 * 2. Su historial: lo que el servidor sugiere porque así lo clasificó antes.
 * 3. Sus palabras clave: lo que escribió en un concepto para reconocerlo.
 * 4. El diccionario del sistema: lo que sabemos de los comercios del país.
 *
 * ── La regla ────────────────────────────────────────────────────────────────
 * Una fuente inferior NUNCA reemplaza a una superior. Lo elegido a mano no lo
 * toca nada automático; una sugerencia del historial puede corregir lo que
 * puso el diccionario, pero no al revés. Y una fuente sí puede reemplazarse a
 * sí misma: el historial que cambia de opinión mientras se escribe sigue
 * siendo el historial.
 *
 * Es una función y no un `if` en la ficha porque las fuentes llegan por
 * caminos distintos —una petición, la lectura de un recibo, un clic— y cada
 * camino tendría su propia versión de la regla. Aquí hay una.
 */
export type Origen = 'manual' | 'historial' | 'palabras-clave' | 'diccionario';

const RANGO: Record<Origen, number> = {
  manual: 4,
  historial: 3,
  'palabras-clave': 2,
  diccionario: 1,
};

export interface Clasificacion {
  categoryId: number | undefined;
  /** `null` es «nadie ha dicho nada todavía». */
  origen: Origen | null;
}

export const SIN_CLASIFICAR: Clasificacion = { categoryId: undefined, origen: null };

/** Lo que una fuente propone. Siempre dice quién es. */
export interface Propuesta {
  categoryId: number | undefined;
  origen: Origen;
}

/** Qué queda después de que una fuente proponga algo. */
export function aplicar(actual: Clasificacion, propuesta: Propuesta): Clasificacion {
  if (propuesta.origen === 'manual') return { ...propuesta };
  if (actual.origen === 'manual') return actual;

  const rangoActual = actual.origen === null ? 0 : RANGO[actual.origen];
  return RANGO[propuesta.origen] >= rangoActual ? { ...propuesta } : actual;
}

/** Para enseñarlo: «Sugerido por tu historial». */
export function nombreDelOrigen(origen: Origen): string {
  switch (origen) {
    case 'manual':
      return 'elegido';
    case 'historial':
      return t('transactions.classification.suggestedByHistory');
    case 'palabras-clave':
      return t('transactions.classification.suggestedByKeywords');
    case 'diccionario':
      return t('transactions.classification.suggestedByMerchant');
  }
}
