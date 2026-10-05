import type { TransactionType } from '@prisma/client';
import { CERO, toMoney, type Money } from '../../common/money/money';

export interface MovimientoAgregable {
  type: TransactionType;
  amount: Money;
  categoryId: bigint | null;
  splits: { categoryId: bigint | null; amount: Money }[];
}

export interface FlujoDelPeriodo {
  income: Money;
  expense: Money;
  net: Money;
}

/**
 * Flujo del periodo.
 *
 * Las TRANSFERENCIAS se excluyen a propósito: mover dinero de ahorros a la
 * cuenta corriente no es un ingreso ni un gasto, solo cambia de bolsillo.
 * Contarlas inflaría ambas cifras y el usuario vería un mes donde "ingresó" y
 * "gastó" plata que nunca entró ni salió de su patrimonio.
 */
export function calcularFlujo(movimientos: readonly MovimientoAgregable[]): FlujoDelPeriodo {
  let income = CERO;
  let expense = CERO;

  for (const movimiento of movimientos) {
    if (movimiento.type === 'income') income = income.plus(movimiento.amount);
    else if (movimiento.type === 'expense') expense = expense.plus(movimiento.amount);
  }

  return {
    income: toMoney(income),
    expense: toMoney(expense),
    net: toMoney(income.minus(expense)),
  };
}

export interface GastoPorCategoria {
  category_id: bigint | null;
  total: Money;
  count: number;
}

/**
 * Reparte el gasto entre categorías.
 *
 * Cuando un movimiento tiene splits, la fuente de verdad para la distribución
 * son los splits, NO el `category_id` de cabecera: si una compra de $150.000 se
 * dividió en mercado y aseo, contarla entera en una sola categoría falsearía
 * ambas cifras.
 *
 * Los movimientos sin categoría no se descartan: se agrupan bajo `null` para
 * que el usuario los vea y pueda clasificarlos. Esconderlos haría que el total
 * por categoría no cuadrara con el gasto real, que es peor que mostrarlos.
 */
export function calcularGastoPorCategoria(
  movimientos: readonly MovimientoAgregable[],
): GastoPorCategoria[] {
  const acumulado = new Map<string, { categoryId: bigint | null; total: Money; count: number }>();

  const acumular = (categoryId: bigint | null, monto: Money): void => {
    const clave = categoryId === null ? 'sin-categoria' : categoryId.toString();
    const actual = acumulado.get(clave) ?? { categoryId, total: CERO, count: 0 };

    acumulado.set(clave, {
      categoryId,
      total: actual.total.plus(monto),
      count: actual.count + 1,
    });
  };

  for (const movimiento of movimientos) {
    if (movimiento.type !== 'expense') continue;

    if (movimiento.splits.length > 0) {
      for (const split of movimiento.splits) {
        acumular(split.categoryId, split.amount);
      }
    } else {
      acumular(movimiento.categoryId, movimiento.amount);
    }
  }

  return [...acumulado.values()]
    .map((entrada) => ({
      category_id: entrada.categoryId,
      total: toMoney(entrada.total),
      count: entrada.count,
    }))
    .sort((a, b) => b.total.comparedTo(a.total));
}

// ═══════════════════════════════════════════════════════════════════════════
// Jerarquía de tres niveles y tendencia
// ═══════════════════════════════════════════════════════════════════════════

/** Lo mínimo de una categoría para subir por sus ancestros. */
export interface CategoriaPlana {
  id: bigint;
  parentId: bigint | null;
}

/**
 * Sube desde una categoría hasta el ancestro que ocupa `nivelObjetivo`.
 *
 * Los movimientos se cuelgan del CONCEPTO, que es el nivel 3. Para responder
 * "¿cuánto se fue en servicios públicos?" hay que subir del concepto a su
 * categoría; para "¿cuánto en costos fijos?", hasta el centro. Sin esto, un
 * desglose por centro saldría vacío: ningún movimiento apunta a un centro.
 *
 * Devuelve `null` si la categoría no llega a ese nivel —un concepto colgado
 * directamente de la raíz no tiene categoría— y quien llame decide qué hacer.
 */
export function ancestroEnNivel(
  categorias: ReadonlyMap<string, CategoriaPlana>,
  categoryId: bigint | null,
  nivelObjetivo: number,
): bigint | null {
  if (categoryId === null) return null;

  // Se sube hasta la raíz guardando el camino, y después se lee por índice.
  const cadena: bigint[] = [];
  let actual: bigint | null = categoryId;
  const visitados = new Set<string>();

  while (actual !== null) {
    const clave = actual.toString();
    if (visitados.has(clave)) break;
    visitados.add(clave);
    cadena.unshift(actual);
    actual = categorias.get(clave)?.parentId ?? null;
  }

  // cadena[0] es el nivel 1. Si la rama es más corta que el nivel pedido, no
  // existe tal ancestro.
  return cadena[nivelObjetivo - 1] ?? null;
}

/**
 * Cuántos días cubre el rango, ambos extremos incluidos.
 */
export function diasDelRango(desde: Date, hasta: Date): number {
  const MS = 24 * 60 * 60 * 1000;
  return Math.floor((hasta.getTime() - desde.getTime()) / MS) + 1;
}

/** Cuántos meses de calendario toca el rango, ambos extremos incluidos. */
export function mesesDelRango(desde: Date, hasta: Date): number {
  return (
    (hasta.getUTCFullYear() - desde.getUTCFullYear()) * 12 +
    (hasta.getUTCMonth() - desde.getUTCMonth()) +
    1
  );
}

/**
 * El tamaño de cubo de la tendencia según lo ancho que sea el rango.
 *
 * Un año en cubos diarios son 365 puntos: la línea se vuelve ruido y no se lee
 * ninguna tendencia. Un mes en cubos mensuales es UN punto, que tampoco dice
 * nada. El corte está en TRES MESES.
 *
 * Se cuentan MESES DE CALENDARIO y no días a propósito. Contando días, "los
 * últimos 3 meses" caía a un lado o al otro del corte según el mes en que se
 * mirara —febrero a abril son 61 días y mayo a julio son 92— y el mismo botón
 * dibujaba a veces una línea de días y a veces una de meses. El eje de tiempo
 * no puede cambiar de unidad según el mes en que uno esté.
 */
export function granularidadPara(desde: Date, hasta: Date): 'dia' | 'mes' {
  return mesesDelRango(desde, hasta) < 3 ? 'dia' : 'mes';
}

/** La etiqueta del cubo al que cae una fecha: `2025-03-14` o `2025-03`. */
export function cuboDe(fecha: Date, granularidad: 'dia' | 'mes'): string {
  const iso = fecha.toISOString().slice(0, 10);
  return granularidad === 'dia' ? iso : iso.slice(0, 7);
}

/**
 * Todos los cubos del rango, incluidos los VACÍOS.
 *
 * Los meses sin gasto tienen que aparecer con cero. Si se omitieran, la línea
 * uniría marzo con mayo y dibujaría una pendiente suave donde en realidad hubo
 * un mes en blanco: la forma de la curva mentiría.
 */
export function cubosDelRango(desde: Date, hasta: Date, granularidad: 'dia' | 'mes'): string[] {
  const cubos: string[] = [];
  const cursor = new Date(
    Date.UTC(
      desde.getUTCFullYear(),
      desde.getUTCMonth(),
      granularidad === 'dia' ? desde.getUTCDate() : 1,
    ),
  );

  while (cursor <= hasta) {
    cubos.push(cuboDe(cursor, granularidad));
    if (granularidad === 'dia') cursor.setUTCDate(cursor.getUTCDate() + 1);
    else cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return cubos;
}
