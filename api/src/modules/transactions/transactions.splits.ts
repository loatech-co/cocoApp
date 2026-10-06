import type { SplitDto } from './dto/transaction.dto';
import type { SplitToWrite } from './transactions.repository';
import { ValidationError } from '../../common/errors/domain-error';
import { serialize, toMoney, type Money } from '../../common/money/money';
import { checkSplitsReconcile } from '../../common/money/splits';

/** Checks that the splits reconcile and normalizes them. Throws 422 if they do not. */
export function splitsToWrite(
  headerAmount: Money,
  splits: readonly SplitDto[] | undefined,
): SplitToWrite[] {
  if (!splits || splits.length === 0) return [];

  const amounts = splits.map((split) => toMoney(split.amount));
  const reconciliation = checkSplitsReconcile(headerAmount, amounts);

  if (!reconciliation.balances) {
    throw new ValidationError(
      `La suma de los splits (${serialize(reconciliation.total)}) no coincide con el monto (${serialize(headerAmount)}). Diferencia: ${serialize(reconciliation.difference)}.`,
      { code: 'splits_unbalanced' },
    );
  }

  return splits.map((split, index) => ({
    categoryId: split.category_id !== undefined ? BigInt(split.category_id) : null,
    amount: amounts[index] ?? toMoney(split.amount), // same value: amounts[i] is this one
    note: split.note ?? null,
  }));
}
