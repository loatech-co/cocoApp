import { periodChange } from './period';
import type { SplitRequest, TransactionEdit } from './transactions.inputs';
import type {
  FullTransaction,
  SplitToWrite,
  TransactionChanges,
  TransactionsRepository,
  TransferPartner,
} from './transactions.repository';
import { splitsToWrite } from './transactions.splits';
import { ValidationError } from '../../common/errors/domain-error';
import { toMoney, type Money } from '../../common/money/money';
import { checkSplitsReconcile } from '../../common/money/splits';
import type { TransactionType } from '../../generated/prisma/client';

/**
 * ── Editing without breaking the balance ─────────────────────────────────────
 * What a PATCH cannot leave half done: the splits of a transaction and the
 * other leg of a transfer. Pure functions; the service applies them.
 */

/**
 * Changing the amount of a split transaction without sending the new splits
 * is 422. The system does not spread the difference: it does not know which
 * concept it belongs to.
 */
export function requireReconciledSplits(
  actual: FullTransaction,
  dto: TransactionEdit,
  amount: Money,
): void {
  if (dto.amount === undefined || dto.splits !== undefined || actual.splits.length === 0) return;
  const reconciliation = checkSplitsReconcile(
    amount,
    actual.splits.map((split) => toMoney(split.amount)),
  );
  if (!reconciliation.balances) {
    throw new ValidationError(
      'El monto nuevo no coincide con la suma del desglose. Envía también los splits ajustados al monto nuevo.',
      { code: 'amount_breaks_splits' },
    );
  }
}

/**
 * What a transfer leg shares with the other one: if it changes in one, it
 * changes in both, in the same database transaction. Not the account: each
 * leg has its own.
 */
export function partnerLegChanges(changes: TransactionChanges): TransactionChanges {
  const { date, period, amount, description, status } = changes;
  return {
    ...(date !== undefined && { date }),
    ...(period !== undefined && { period }),
    ...(amount !== undefined && { amount }),
    ...(description !== undefined && { description }),
    ...(status !== undefined && { status }),
  };
}

/**
 * A transfer is two legs written together (`POST /transactions/transfer`):
 * a loose leg with `type: 'transfer'` and no group moved money out of one
 * account without it arriving anywhere (R4-A, A2).
 */
export function requireNotLooseTransfer(type: TransactionType | undefined): void {
  if (type === 'transfer') {
    throw new ValidationError(
      'Una transferencia se registra con sus dos cuentas en POST /transactions/transfer.',
      { code: 'transfer_requires_two_legs' },
    );
  }
}

/** A leg does not become an expense or an income: it would leave the other one alone. */
export function requireStillTransfer(dto: TransactionEdit): void {
  if (dto.type !== undefined && dto.type !== 'transfer') {
    throw new ValidationError(
      'Una transferencia no puede cambiar de tipo. Bórrala y registra el movimiento de nuevo.',
      { code: 'transfer_leg_locked' },
    );
  }
}

/**
 * The columns a PATCH changes: only what the DTO brought. `period` is the one
 * exception: a new `date` may move it too (`periodChange`).
 */
export function changesOf(
  dto: TransactionEdit,
  actual: Pick<FullTransaction, 'date' | 'period'>,
  accountId: bigint | null,
  amount: Money,
): TransactionChanges {
  const period = periodChange(dto, actual);
  return {
    ...(dto.accountId !== undefined && { accountId }),
    ...(dto.date !== undefined && { date: new Date(dto.date) }),
    ...(period !== undefined && { period }),
    ...(dto.amount !== undefined && { amount }),
    ...(dto.type !== undefined && { type: dto.type }),
    ...(dto.categoryId !== undefined && {
      categoryId: dto.categoryId === null ? null : BigInt(dto.categoryId),
    }),
    ...(dto.description !== undefined && { description: dto.description }),
    ...(dto.merchant !== undefined && { merchant: dto.merchant }),
    ...(dto.notes !== undefined && { notes: dto.notes }),
    ...(dto.status !== undefined && { status: dto.status }),
    ...(dto.source !== undefined && { source: dto.source }),
    ...(dto.rawText !== undefined && { rawText: dto.rawText }),
    ...(dto.capturedAt !== undefined && {
      capturedAt: dto.capturedAt === null ? null : new Date(dto.capturedAt),
    }),
    ...(dto.needsReview !== undefined && { needsReview: dto.needsReview }),
  };
}

/**
 * Editing a transfer leg edits both (like deleting): a different amount on
 * each leg breaks the balances of both accounts.
 */
export async function partnerLeg(
  repository: TransactionsRepository,
  userId: bigint,
  actual: FullTransaction,
  dto: TransactionEdit,
  changes: TransactionChanges,
): Promise<TransferPartner | null> {
  if (actual.transferGroupId === null) return null;
  requireStillTransfer(dto);
  if (dto.accountId !== undefined) {
    const partnerAccount = await repository.partnerAccount(
      userId,
      actual.transferGroupId,
      actual.id,
    );
    if (partnerAccount !== null && partnerAccount === BigInt(dto.accountId)) {
      throw new ValidationError('La cuenta de origen y la de destino no pueden ser la misma.', {
        code: 'transfer_same_account',
      });
    }
  }
  return {
    userId,
    transferGroupId: actual.transferGroupId,
    changes: partnerLegChanges(changes),
  };
}

/**
 * Checks the splits reconcile and requires each category to be the user's
 * (422): without it a split hung one's own transaction from someone else's
 * concept.
 */
export async function prepareSplits(
  repository: TransactionsRepository,
  userId: bigint,
  headerAmount: Money,
  splits: readonly SplitRequest[] | undefined,
): Promise<SplitToWrite[]> {
  const listos = splitsToWrite(headerAmount, splits);
  const ids = listos.flatMap((split) => (split.categoryId !== null ? [split.categoryId] : []));
  if (!(await repository.categoriesBelongTo(userId, ids))) {
    throw new ValidationError('La categoría indicada no existe o no es tuya.', {
      code: 'category_not_owned',
    });
  }
  return listos;
}
