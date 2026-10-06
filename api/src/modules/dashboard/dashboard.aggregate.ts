import { ZERO, toMoney, type Money } from '../../common/money/money';
import type { TransactionType } from '../../generated/prisma/client';

export interface AggregableMovement {
  type: TransactionType;
  amount: Money;
  categoryId: bigint | null;
  splits: { categoryId: bigint | null; amount: Money }[];
}

export interface PeriodFlow {
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
export function computeFlow(movements: readonly AggregableMovement[]): PeriodFlow {
  let income = ZERO;
  let expense = ZERO;

  for (const movement of movements) {
    if (movement.type === 'income') income = income.plus(movement.amount);
    else if (movement.type === 'expense') expense = expense.plus(movement.amount);
  }

  return {
    income: toMoney(income),
    expense: toMoney(expense),
    net: toMoney(income.minus(expense)),
  };
}

export interface ExpenseByCategory {
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
export function computeExpenseByCategory(
  movements: readonly AggregableMovement[],
): ExpenseByCategory[] {
  const accumulated = new Map<string, { categoryId: bigint | null; total: Money; count: number }>();

  const accumulate = (categoryId: bigint | null, amount: Money): void => {
    const key = categoryId === null ? 'sin-categoria' : categoryId.toString();
    const current = accumulated.get(key) ?? { categoryId, total: ZERO, count: 0 };

    accumulated.set(key, {
      categoryId,
      total: current.total.plus(amount),
      count: current.count + 1,
    });
  };

  for (const movement of movements) {
    if (movement.type !== 'expense') continue;

    if (movement.splits.length > 0) {
      for (const split of movement.splits) {
        accumulate(split.categoryId, split.amount);
      }
    } else {
      accumulate(movement.categoryId, movement.amount);
    }
  }

  return [...accumulated.values()]
    .map((entry) => ({
      category_id: entry.categoryId,
      total: toMoney(entry.total),
      count: entry.count,
    }))
    .sort((a, b) => b.total.comparedTo(a.total));
}

// ═══════════════════════════════════════════════════════════════════════════
// Jerarquía de tres niveles y tendencia
// ═══════════════════════════════════════════════════════════════════════════

/** Lo mínimo de una categoría para subir por sus ancestros. */
export interface FlatCategory {
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
export function ancestorAtLevel(
  categories: ReadonlyMap<string, FlatCategory>,
  categoryId: bigint | null,
  targetLevel: number,
): bigint | null {
  if (categoryId === null) return null;

  // Se sube hasta la raíz guardando el camino, y después se lee por índice.
  const chain: bigint[] = [];
  let current: bigint | null = categoryId;
  const visited = new Set<string>();

  while (current !== null) {
    const key = current.toString();
    if (visited.has(key)) break;
    visited.add(key);
    chain.unshift(current);
    current = categories.get(key)?.parentId ?? null;
  }

  // cadena[0] es el nivel 1. Si la rama es más corta que el nivel pedido, no
  // existe tal ancestro.
  return chain[targetLevel - 1] ?? null;
}

/**
 * Cuántos días cubre el rango, ambos extremos incluidos.
 */
export function daysInRange(from: Date, to: Date): number {
  const MS = 24 * 60 * 60 * 1000;
  return Math.floor((to.getTime() - from.getTime()) / MS) + 1;
}

/** Cuántos meses de calendario toca el rango, ambos extremos incluidos. */
function monthsInRange(from: Date, to: Date): number {
  return (
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth()) + 1
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
export function granularityFor(from: Date, to: Date): 'day' | 'month' {
  return monthsInRange(from, to) < 3 ? 'day' : 'month';
}

/** La etiqueta del cubo al que cae una fecha: `2025-03-14` o `2025-03`. */
export function bucketOf(date: Date, granularity: 'day' | 'month'): string {
  const iso = date.toISOString().slice(0, 10);
  return granularity === 'day' ? iso : iso.slice(0, 7);
}

/**
 * Todos los cubos del rango, incluidos los VACÍOS.
 *
 * Los meses sin gasto tienen que aparecer con cero. Si se omitieran, la línea
 * uniría marzo con mayo y dibujaría una pendiente suave donde en realidad hubo
 * un mes en blanco: la forma de la curva mentiría.
 */
export function rangeBuckets(from: Date, to: Date, granularity: 'day' | 'month'): string[] {
  const buckets: string[] = [];
  const cursor = new Date(
    Date.UTC(
      from.getUTCFullYear(),
      from.getUTCMonth(),
      granularity === 'day' ? from.getUTCDate() : 1,
    ),
  );

  while (cursor <= to) {
    buckets.push(bucketOf(cursor, granularity));
    if (granularity === 'day') cursor.setUTCDate(cursor.getUTCDate() + 1);
    else cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return buckets;
}
