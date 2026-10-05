/**
 * Cómo se escriben las fechas en la interfaz.
 *
 * ── Por qué están todas aquí ────────────────────────────────────────────────
 * Porque una misma fecha se escribía de tres formas distintas —una en el botón
 * del rango, otra en la tarjeta de la gráfica, otra en la tabla— y cada una
 * tenía su propia copia de la lista de meses. Cambiar el criterio obligaba a
 * encontrar las tres.
 *
 * ── Largo y corto, y cuándo va cada uno ─────────────────────────────────────
 * LARGO donde se lee una fecha concreta y hay sitio: el botón del rango y la
 * tarjeta de la gráfica. Ahí "sep 26" obliga a descifrar una abreviatura y a
 * adivinar si el 26 es día o año.
 *
 * CORTO en el eje de la gráfica y en la tabla, donde hay decenas de fechas y
 * el nombre completo las haría chocar unas con otras.
 */

export const MESES_CORTOS = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
];

export const MESES_LARGOS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

const partes = (iso: string): { anio: string; mes: number; dia: number } => {
  // `split` siempre devuelve al menos un trozo: el año nunca falta.
  const [anio = '', mes, dia] = iso.split('-');
  return { anio, mes: Number(mes), dia: Number(dia) };
};

const conMayuscula = (texto: string): string => texto.charAt(0).toUpperCase() + texto.slice(1);

/** `2026-09-06` → `6 de septiembre de 2026`. */
export function diaLargo(iso: string): string {
  const { anio, mes, dia } = partes(iso);
  return `${dia} de ${MESES_LARGOS[mes - 1] ?? mes} de ${anio}`;
}

/** `2026-09-06` → `6 sep 2026`. Para tablas y ejes. */
export function diaCorto(iso: string): string {
  const { anio, mes, dia } = partes(iso);
  return `${dia} ${MESES_CORTOS[mes - 1] ?? mes} ${anio}`;
}

/** `2026-09` o `2026-09-01` → `Septiembre de 2026`. */
export function mesLargo(iso: string): string {
  const { anio, mes } = partes(iso);
  return `${conMayuscula(MESES_LARGOS[mes - 1] ?? String(mes))} de ${anio}`;
}

/** `2026-09-01` → `sep 2026`. */
export function mesCorto(iso: string): string {
  const { anio, mes } = partes(iso);
  return `${MESES_CORTOS[mes - 1] ?? mes} ${anio}`;
}

/**
 * Un rango escrito de corrido: `6 de septiembre — 15 de septiembre de 2026`.
 *
 * El año se escribe una sola vez cuando el rango no lo cruza. Repetirlo en los
 * dos extremos ocupa sitio sin decir nada nuevo. El mes también desaparece del
 * primer extremo cuando los dos caen en el mismo.
 */
export function rangoLargo(desde: string, hasta: string): string {
  const a = partes(desde);
  const b = partes(hasta);

  if (a.anio !== b.anio) return `${diaLargo(desde)} — ${diaLargo(hasta)}`;
  if (a.mes !== b.mes) {
    return `${a.dia} de ${MESES_LARGOS[a.mes - 1]} — ${diaLargo(hasta)}`;
  }
  return `${a.dia} — ${diaLargo(hasta)}`;
}
