import type { Money } from '../../common/money/money';
import { toMoney } from '../../common/money/money';
import type { Prisma, TransactionType } from '../../generated/prisma/client';
import type { UserTx } from '../../prisma/database';

export type TypedSums = Map<TransactionType, Money>;

/** The sums by type over every row of the filter, done by the database. */
export async function sumsOfRows(
  tx: UserTx,
  where: Prisma.TransactionWhereInput,
): Promise<TypedSums> {
  const sums = await tx.transaction.groupBy({ by: ['type'], where, _sum: { amount: true } });
  return new Map(sums.map((s) => [s.type, toMoney(s._sum.amount ?? 0)]));
}

/**
 * ── Why the sums of a branch are not the sums of its rows ────────────────────
 * A split purchase matches the branch through ONE of its parts; adding the
 * whole row would charge the branch with what it paid to other concepts, and
 * the list footer would not agree with the dashboard flow for the same filter.
 * As `restrictToBranch` does for the dashboard, a split row pays only its
 * parts inside the branch, and a row without splits pays its whole amount
 * (it matched by its own category). ADR 0034.
 */
export async function sumsInBranch(
  tx: UserTx,
  where: Prisma.TransactionWhereInput,
  branch: readonly bigint[],
): Promise<TypedSums> {
  const whole = await sumsOfRows(tx, { AND: [where, { splits: { none: {} } }] });
  const types: TransactionType[] = ['expense', 'income'];
  const parts = await Promise.all(
    types.map((type) =>
      tx.transactionSplit.aggregate({
        where: { categoryId: { in: [...branch] }, transaction: { AND: [where, { type }] } },
        _sum: { amount: true },
      }),
    ),
  );
  return new Map(
    types.map((type, i) => [
      type,
      (whole.get(type) ?? toMoney(0)).plus(toMoney(parts[i]?._sum.amount ?? 0)),
    ]),
  );
}
