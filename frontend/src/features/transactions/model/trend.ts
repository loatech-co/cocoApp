import { longDay, SHORT_MONTHS, longMonth } from '@/shared/lib/format';
import { t } from '@/shared/lib/i18n';

/*
  La geometría y el eje de la gráfica de tendencia: lo que se calcula sin dibujar.
*/

/** The unit a trend is grouped by, as a person reads it: `día` or `mes`. */
export function unidad(granularidad: 'dia' | 'mes'): string {
  return granularidad === 'dia'
    ? t('transactions.trend.units.day')
    : t('transactions.trend.units.month');
}

/** Coordenada X de un punto en el lienzo de 0–100. */
export function equis(i: number, total: number): number {
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
export const ALTO_LIENZO = 42;
const MARGEN_Y = 3;

export function ye(valor: number, techo: number): number {
  const util = ALTO_LIENZO - MARGEN_Y * 2;
  return ALTO_LIENZO - MARGEN_Y - (valor / techo) * util;
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
export function curva(puntos: { x: number; y: number }[]): string {
  const [primero] = puntos;
  if (primero === undefined) return '';
  if (puntos.length === 1) return `M ${primero.x} ${primero.y}`;

  const n = puntos.length;
  // Todos los índices de abajo van de 0 a n - 1: los respaldos no se usan nunca.
  const punto = (i: number): { x: number; y: number } => puntos[i] ?? primero;
  const valor = (lista: readonly number[], i: number): number => lista[i] ?? 0;

  // Pendiente de cada tramo.
  const deltas: number[] = [];
  for (let i = 0; i < n - 1; i += 1) {
    const dx = punto(i + 1).x - punto(i).x;
    deltas.push(dx === 0 ? 0 : (punto(i + 1).y - punto(i).y) / dx);
  }

  // Tangente en cada punto: el promedio de las pendientes que llegan a él.
  const tangentes: number[] = [valor(deltas, 0)];
  for (let i = 1; i < n - 1; i += 1) {
    tangentes.push((valor(deltas, i - 1) + valor(deltas, i)) / 2);
  }
  tangentes.push(valor(deltas, n - 2));

  // Y aquí está lo que impide el sobrepaso. Donde el tramo es plano, la curva
  // llega y sale plana; donde no, las tangentes se recortan al círculo de
  // radio 3, que es la condición de Fritsch–Carlson.
  for (let i = 0; i < n - 1; i += 1) {
    const delta = valor(deltas, i);
    if (delta === 0) {
      tangentes[i] = 0;
      tangentes[i + 1] = 0;
      continue;
    }

    const a = valor(tangentes, i) / delta;
    const b = valor(tangentes, i + 1) / delta;
    const s = a * a + b * b;

    if (s > 9) {
      const factor = 3 / Math.sqrt(s);
      tangentes[i] = factor * a * delta;
      tangentes[i + 1] = factor * b * delta;
    }
  }

  let d = `M ${primero.x.toFixed(2)} ${primero.y.toFixed(2)}`;
  for (let i = 0; i < n - 1; i += 1) {
    const desde = punto(i);
    const hasta = punto(i + 1);
    const h = (hasta.x - desde.x) / 3;
    const c1 = { x: desde.x + h, y: desde.y + valor(tangentes, i) * h };
    const c2 = { x: hasta.x - h, y: hasta.y - valor(tangentes, i + 1) * h };
    d +=
      ` C ${c1.x.toFixed(2)} ${c1.y.toFixed(2)},` +
      ` ${c2.x.toFixed(2)} ${c2.y.toFixed(2)},` +
      ` ${hasta.x.toFixed(2)} ${hasta.y.toFixed(2)}`;
  }

  return d;
}

/** La serie en coordenadas del lienzo. */
function aPuntos(serie: number[], techo: number, total: number): { x: number; y: number }[] {
  return serie.map((v, i) => ({ x: equis(i, total), y: ye(v, techo) }));
}

export function linea(serie: number[], techo: number, total: number): string {
  return curva(aPuntos(serie, techo, total));
}

/** La misma línea, cerrada contra la base, para el relleno. */
export function area(serie: number[], techo: number, total: number): string {
  // Cierra en la línea del CERO, no en el borde del lienzo: cerrando abajo
  // del todo, el relleno se extendía por debajo de donde vale cero.
  const base = ye(0, techo).toFixed(2);
  return `${linea(serie, techo, total)} L ${equis(total - 1, total).toFixed(2)} ${base} L ${equis(0, total).toFixed(2)} ${base} Z`;
}

/**
 * La fecha de un punto, entera: `6 de septiembre de 2026` o `Septiembre de
 * 2026`.
 *
 * Aquí sí cabe y aquí sí hace falta. En el eje hay decenas de fechas y el
 * nombre completo las haría chocar; en la tarjeta hay UNA, y "sep 26" obliga a
 * descifrar una abreviatura y a adivinar si el 26 es el día o el año.
 */
export function fechaLarga(bucket: string): string {
  return bucket.length > 7 ? longDay(bucket) : longMonth(bucket);
}

/** El último día de un mes: 28, 29, 30 o 31 según cuál sea. */
function ultimoDia(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
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
export function etiquetasDelEje(
  puntos: readonly { bucket: string }[],
  granularidad: 'dia' | 'mes',
): { indice: number; texto: string }[] {
  if (granularidad === 'mes') {
    const cada = Math.max(1, Math.ceil(puntos.length / 12));

    // Todas las etiquetas con la MISMA forma. Escribir el año solo donde
    // cambia deja un eje que mezcla "ene" con "abr 23" y se lee como si
    // fueran dos cosas distintas. Si el rango cruza de año, el año va en
    // todas; si no cruza, en ninguna.
    const cruzaDeAnio = new Set(puntos.map((p) => p.bucket.slice(0, 4))).size > 1;

    return puntos
      .map((p, indice) => ({ indice, bucket: p.bucket }))
      .filter(({ indice }) => indice % cada === 0)
      .map(({ indice, bucket }) => {
        const [anio, mes = ''] = bucket.split('-');
        const nombre = SHORT_MONTHS[Number(mes) - 1] ?? mes;
        const conMayuscula = nombre.charAt(0).toUpperCase() + nombre.slice(1);
        // El año ENTERO, no sus dos últimas cifras. "Abr 23" obliga a
        // completarlo mentalmente, y en un histórico que arranca en 2022 eso
        // es justo lo que hay que leer sin esfuerzo.
        return { indice, texto: cruzaDeAnio ? `${conMayuscula} ${anio}` : conMayuscula };
      });
  }

  const etiquetas: { indice: number; texto: string }[] = [];
  let mesEscrito = '';

  puntos.forEach((p, indice) => {
    // Un cubo diario trae siempre sus tres partes: los respaldos no se usan.
    const [anio = NaN, mes = NaN, dia = NaN] = p.bucket.split('-').map(Number);
    const esUltimo = dia === ultimoDia(anio, mes);
    // 5, 10, 15, 20 y 25. El 30 queda fuera: o cierra el mes —y entra por la
    // otra condición— o está a un día del 31, que sí lo cierra.
    const esQuinto = dia % 5 === 0 && dia < 26;
    if (!esQuinto && !esUltimo) return;

    const clave = p.bucket.slice(0, 7);
    const texto = clave === mesEscrito ? String(dia) : `${dia} ${SHORT_MONTHS[mes - 1] ?? mes}`;
    mesEscrito = clave;

    etiquetas.push({ indice, texto });
  });

  return etiquetas;
}

/**
 * `2025-03-14` → `14 mar`. `2025-03` → `mar 25`, o solo `mar` si todo el rango
 * cae en el mismo año.
 *
 * Repetir el año en los doce puntos de un mismo año es ruido: ocupa espacio,
 * hace que las etiquetas se pisen y no distingue un punto de otro. Solo aporta
 * cuando el rango cruza de año.
 */
export function etiquetaDeCubo(bucket: string, mismoAnio = false): string {
  const [anio = '', mes = '', dia] = bucket.split('-');
  const nombre = SHORT_MONTHS[Number(mes) - 1] ?? mes;
  if (dia) return `${Number(dia)} ${nombre}`;
  return mismoAnio ? nombre : `${nombre} ${anio.slice(2)}`;
}
