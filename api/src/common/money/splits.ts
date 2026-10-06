import { areEqual, sum, toMoney, type Money } from './money';

export interface ReconciliationResult {
  balances: boolean;
  total: Money;
  /** `suma − amount`. Positivo: los splits se pasan. Negativo: faltan. */
  difference: Money;
}

/**
 * Verifica la invariante de los splits: su suma debe igualar EXACTAMENTE el
 * monto de la transacción.
 *
 * Se compara con `Prisma.Decimal.equals`, no con `===` (compararía referencias)
 * ni con `Math.abs(a - b) < epsilon` (un epsilon en dinero es una licencia para
 * perder centavos). En una app financiera "casi igual" no existe.
 *
 * La `diferencia` se devuelve para que la UI pueda ofrecer "ajustar al
 * restante" en vez de solo decir que está mal.
 */
export function checkSplitsReconcile(
  headerAmount: Money,
  splitAmounts: readonly Money[],
): ReconciliationResult {
  const total = toMoney(sum(splitAmounts));
  const header = toMoney(headerAmount);

  return {
    balances: areEqual(total, header),
    total,
    difference: toMoney(total.minus(header)),
  };
}
