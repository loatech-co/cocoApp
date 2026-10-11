import { ZERO, toMoney } from '../../common/money/money';
import type { SummaryMovement } from '../transactions/ledger.service';

/**
 * ── Why the rows are trimmed to the branch ───────────────────────────────────
 * Filtering by a category brings every row that touches its branch, even if
 * only ONE of its splits does. Left whole, the flow and the trend added the
 * entire row and the breakdown pushed the other splits onto their own
 * centers: the three figures on the same screen disagreed (R4-A, A1).
 *
 * With a branch, a split row keeps only the parts inside it and its amount
 * becomes their sum; a split row that matched through its header alone pays
 * nothing to the branch (the splits are the source) and is dropped. Rows
 * without splits are kept as they are: they matched by their own category.
 */
export function restrictToBranch(
  movements: readonly SummaryMovement[],
  branch: readonly bigint[] | null,
): SummaryMovement[] {
  if (branch === null) return [...movements];
  const inBranch = new Set(branch.map(String));

  return movements.flatMap((movement) => {
    if (movement.splits.length === 0) return [movement];

    const splits = movement.splits.filter(
      (split) => split.categoryId !== null && inBranch.has(split.categoryId.toString()),
    );
    if (splits.length === 0) return [];

    const amount = splits.reduce((total, split) => total.plus(toMoney(split.amount)), ZERO);
    return [{ ...movement, amount, splits }];
  });
}
