import { areEqual, sum, toMoney, type Money } from './money';

export interface ReconciliationResult {
  balances: boolean;
  total: Money;
  /** `total − amount`. Positive: the splits go over. Negative: they fall short. */
  difference: Money;
}

/**
 * Checks the splits' invariant: their sum must equal the transaction's amount
 * EXACTLY.
 *
 * It compares with `Prisma.Decimal.equals`, not `===` (it would compare
 * references) nor `Math.abs(a - b) < epsilon` (an epsilon on money is a
 * licence to lose cents). In a finance app "almost equal" does not exist.
 *
 * The `difference` is returned so the UI can offer "adjust to the remainder"
 * instead of just saying it is wrong.
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
