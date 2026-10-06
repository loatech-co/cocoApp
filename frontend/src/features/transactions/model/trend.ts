import { longDay, SHORT_MONTHS, longMonth } from '@/shared/lib/format';
import { t } from '@/shared/lib/i18n';

/*
  La geometría y el eje de la gráfica de tendencia: lo que se calcula sin dibujar.
*/

/** The unit a trend is grouped by, as a person reads it: `día` or `mes`. */
export function unit(granularity: 'dia' | 'mes'): string {
  return granularity === 'dia'
    ? t('transactions.trend.units.day')
    : t('transactions.trend.units.month');
}

/** Coordenada X de un punto en el lienzo de 0–100. */
export function xAt(i: number, total: number): number {
  return total === 1 ? 50 : (i / (total - 1)) * 100;
}

/**
 * Coordenada Y: se invierte porque en SVG el 0 está arriba.
 *
 * ── Por qué hay margen arriba y abajo ───────────────────────────────────────
 * Porque el punto más alto de la serie vale justo el techo, y sin margen caía
 * en y=0: la mitad del grosor del trazo quedaba fuera del lienzo y el SVG la
 * recortaba. La línea aparecía cortada a ras justo en su pico, que es el dato
 * que uno estaba mirando. Igual abajo con los ceros.
 */
export const CANVAS_HEIGHT = 42;
const MARGIN_Y = 3;

export function yAt(value: number, ceiling: number): number {
  const usable = CANVAS_HEIGHT - MARGIN_Y * 2;
  return CANVAS_HEIGHT - MARGIN_Y - (value / ceiling) * usable;
}

/**
 * La línea, en curvas.
 *
 * ── Por qué curva y no tramos rectos ────────────────────────────────────────
 * Porque la serie es un MUESTREO de algo continuo: el gasto no salta de un
 * valor a otro en el instante que cambia el día, va y viene. Los tramos rectos
 * con sus picos en punta sugieren una precisión que el dato no tiene.
 *
 * ── Por qué MONÓTONA y no una curva cualquiera ──────────────────────────────
 * Una spline normal se pasa de largo al doblar: entre un mes de cero y otro de
 * un millón, la curva baja por debajo de cero antes de subir. Dibujar un gasto
 * negativo que nunca existió no es suavizar, es mentir. Esta variante
 * —Fritsch–Carlson— ajusta las pendientes para que la curva nunca se salga del
 * rango de los dos puntos que une: si el dato sube, la curva sube; si el dato
 * no baja de cero, la curva tampoco.
 */
export function curve(points: { x: number; y: number }[]): string {
  const [first] = points;
  if (first === undefined) return '';
  if (points.length === 1) return `M ${first.x} ${first.y}`;

  const n = points.length;
  // Todos los índices de abajo van de 0 a n - 1: los respaldos no se usan nunca.
  const point = (i: number): { x: number; y: number } => points[i] ?? first;
  const value = (list: readonly number[], i: number): number => list[i] ?? 0;

  // Pendiente de cada tramo.
  const deltas: number[] = [];
  for (let i = 0; i < n - 1; i += 1) {
    const dx = point(i + 1).x - point(i).x;
    deltas.push(dx === 0 ? 0 : (point(i + 1).y - point(i).y) / dx);
  }

  // Tangente en cada punto: el promedio de las pendientes que llegan a él.
  const tangentes: number[] = [value(deltas, 0)];
  for (let i = 1; i < n - 1; i += 1) {
    tangentes.push((value(deltas, i - 1) + value(deltas, i)) / 2);
  }
  tangentes.push(value(deltas, n - 2));

  // Y aquí está lo que impide el sobrepaso. Donde el tramo es plano, la curva
  // llega y sale plana; donde no, las tangentes se recortan al círculo de
  // radio 3, que es la condición de Fritsch–Carlson.
  for (let i = 0; i < n - 1; i += 1) {
    const delta = value(deltas, i);
    if (delta === 0) {
      tangentes[i] = 0;
      tangentes[i + 1] = 0;
      continue;
    }

    const a = value(tangentes, i) / delta;
    const b = value(tangentes, i + 1) / delta;
    const s = a * a + b * b;

    if (s > 9) {
      const factor = 3 / Math.sqrt(s);
      tangentes[i] = factor * a * delta;
      tangentes[i + 1] = factor * b * delta;
    }
  }

  let d = `M ${first.x.toFixed(2)} ${first.y.toFixed(2)}`;
  for (let i = 0; i < n - 1; i += 1) {
    const from = point(i);
    const to = point(i + 1);
    const h = (to.x - from.x) / 3;
    const c1 = { x: from.x + h, y: from.y + value(tangentes, i) * h };
    const c2 = { x: to.x - h, y: to.y - value(tangentes, i + 1) * h };
    d +=
      ` C ${c1.x.toFixed(2)} ${c1.y.toFixed(2)},` +
      ` ${c2.x.toFixed(2)} ${c2.y.toFixed(2)},` +
      ` ${to.x.toFixed(2)} ${to.y.toFixed(2)}`;
  }

  return d;
}

/** La serie en coordenadas del lienzo. */
function toPoints(series: number[], ceiling: number, total: number): { x: number; y: number }[] {
  return series.map((v, i) => ({ x: xAt(i, total), y: yAt(v, ceiling) }));
}

export function line(series: number[], ceiling: number, total: number): string {
  return curve(toPoints(series, ceiling, total));
}

/** La misma línea, cerrada contra la base, para el relleno. */
export function area(series: number[], ceiling: number, total: number): string {
  // Cierra en la línea del CERO, no en el borde del lienzo: cerrando abajo
  // del todo, el relleno se extendía por debajo de donde vale cero.
  const base = yAt(0, ceiling).toFixed(2);
  return `${line(series, ceiling, total)} L ${xAt(total - 1, total).toFixed(2)} ${base} L ${xAt(0, total).toFixed(2)} ${base} Z`;
}

/**
 * La fecha de un punto, entera: `6 de septiembre de 2026` o `Septiembre de
 * 2026`.
 *
 * Aquí sí cabe y aquí sí hace falta. En el eje hay decenas de fechas y el
 * nombre completo las haría chocar; en la tarjeta hay UNA, y "sep 26" obliga a
 * descifrar una abreviatura y a adivinar si el 26 es el día o el año.
 */
export function longDate(bucket: string): string {
  return bucket.length > 7 ? longDay(bucket) : longMonth(bucket);
}

/** El último día de un mes: 28, 29, 30 o 31 según cuál sea. */
function lastDay(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Qué puntos del eje llevan etiqueta, y qué dice cada una.
 *
 * ── Menos de tres meses: cada cinco días ────────────────────────────────────
 * 5, 10, 15, 20, 25 y el último del mes —28, 29, 30 o 31, según cuál sea—. El
 * 30 solo aparece cuando de verdad cierra el mes: en un mes de 31 días sería
 * una etiqueta pegada a la siguiente.
 *
 * No se habla de "semanas" porque las semanas no coinciden con los meses: la
 * semana 5 empieza un martes en marzo y un viernes en abril, y comparar dos
 * meses dejaría de ser posible.
 *
 * El NOMBRE DEL MES se escribe solo la primera vez que aparece. Sin él, un
 * rango de dos meses muestra "5 10 15 20 25 31 5 10 15 20 25 30" y no hay
 * forma de saber dónde termina uno y empieza el otro.
 *
 * ── Tres meses o más: solo el mes ───────────────────────────────────────────
 * "Ene Feb Mar", sin día. Todas con la misma forma: si el rango cruza de año
 * lo llevan todas —entero, "Abr 2023"— y si no lo cruza no lo lleva ninguna. Escribirlo solo donde
 * cambia dejaba un eje que mezclaba "ene" con "abr 23" y se leía como si
 * fueran dos cosas distintas.
 *
 * Y si son tantos meses que no caben, uno de cada tantos. Cincuenta etiquetas
 * en un teléfono no se leen: se tocan.
 */
export function axisLabels(
  points: readonly { bucket: string }[],
  granularity: 'dia' | 'mes',
): { index: number; text: string }[] {
  if (granularity === 'mes') {
    const every = Math.max(1, Math.ceil(points.length / 12));

    // Todas las etiquetas con la MISMA forma. Escribir el año solo donde
    // cambia deja un eje que mezcla "ene" con "abr 23" y se lee como si
    // fueran dos cosas distintas. Si el rango cruza de año, el año va en
    // todas; si no cruza, en ninguna.
    const isMultiYear = new Set(points.map((p) => p.bucket.slice(0, 4))).size > 1;

    return points
      .map((p, index) => ({ index, bucket: p.bucket }))
      .filter(({ index }) => index % every === 0)
      .map(({ index, bucket }) => {
        const [year, month = ''] = bucket.split('-');
        const name = SHORT_MONTHS[Number(month) - 1] ?? month;
        const capitalized = name.charAt(0).toUpperCase() + name.slice(1);
        // El año ENTERO, no sus dos últimas cifras. "Abr 23" obliga a
        // completarlo mentalmente, y en un histórico que arranca en 2022 eso
        // es justo lo que hay que leer sin esfuerzo.
        return { index, text: isMultiYear ? `${capitalized} ${year}` : capitalized };
      });
  }

  const labels: { index: number; text: string }[] = [];
  let monthName = '';

  points.forEach((p, index) => {
    // Un cubo diario trae siempre sus tres partes: los respaldos no se usan.
    const [year = NaN, month = NaN, day = NaN] = p.bucket.split('-').map(Number);
    const isLast = day === lastDay(year, month);
    // 5, 10, 15, 20 y 25. El 30 queda fuera: o cierra el mes —y entra por la
    // otra condición— o está a un día del 31, que sí lo cierra.
    const isFifth = day % 5 === 0 && day < 26;
    if (!isFifth && !isLast) return;

    const key = p.bucket.slice(0, 7);
    const text = key === monthName ? String(day) : `${day} ${SHORT_MONTHS[month - 1] ?? month}`;
    monthName = key;

    labels.push({ index, text });
  });

  return labels;
}

/**
 * `2025-03-14` → `14 mar`. `2025-03` → `mar 25`, o solo `mar` si todo el rango
 * cae en el mismo año.
 *
 * Repetir el año en los doce puntos de un mismo año es ruido: ocupa espacio,
 * hace que las etiquetas se pisen y no distingue un punto de otro. Solo aporta
 * cuando el rango cruza de año.
 */
export function bucketLabel(bucket: string, isSameYear = false): string {
  const [year = '', month = '', day] = bucket.split('-');
  const name = SHORT_MONTHS[Number(month) - 1] ?? month;
  if (day) return `${Number(day)} ${name}`;
  return isSameYear ? name : `${name} ${year.slice(2)}`;
}
