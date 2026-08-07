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
