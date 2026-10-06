import type { UpdateTransactionDto } from './dto/transaction.dto';
import type { FullTransaction, TransactionChanges } from './transactions.repository';
import { ValidationError } from '../../common/errors/domain-error';
import { toMoney, type Money } from '../../common/money/money';
import { checkSplitsReconcile } from '../../common/money/splits';

/**
 * ── Editar sin descuadrar ────────────────────────────────────────────────────
 * Lo que un PATCH no puede dejar a medias: el desglose de un movimiento y la
 * otra pata de una transferencia. Funciones puras; el servicio las aplica.
 */

/**
 * Cambiar el monto de un movimiento con desglose sin mandar el desglose nuevo
 * es 422. El sistema no reparte la diferencia: no sabe a qué concepto le toca.
 */
export function requireReconciledSplits(
  actual: FullTransaction,
  dto: UpdateTransactionDto,
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
 * Lo que una pata de transferencia comparte con la otra: si cambia en una,
 * cambia en las dos, en la misma transacción. La cuenta no: cada pata tiene
 * la suya.
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

/** Una pata no se vuelve gasto ni ingreso: dejaría a la otra sola. */
export function requireStillTransfer(dto: UpdateTransactionDto): void {
  if (dto.type !== undefined && dto.type !== 'transfer') {
    throw new ValidationError(
      'Una transferencia no puede cambiar de tipo. Bórrala y registra el movimiento de nuevo.',
      { code: 'transfer_leg_locked' },
    );
  }
}

/** The columns a PATCH changes: only what the DTO brought. */
export function changesOf(
  dto: UpdateTransactionDto,
  accountId: bigint | null,
  amount: Money,
): TransactionChanges {
  return {
    ...(dto.account_id !== undefined && { accountId }),
    ...(dto.date !== undefined && { date: new Date(dto.date) }),
    ...(dto.amount !== undefined && { amount }),
    ...(dto.type !== undefined && { type: dto.type }),
    ...(dto.category_id !== undefined && {
      categoryId: dto.category_id === null ? null : BigInt(dto.category_id),
    }),
    ...(dto.description !== undefined && { description: dto.description }),
    ...(dto.merchant !== undefined && { merchant: dto.merchant }),
    ...(dto.notes !== undefined && { notes: dto.notes }),
    ...(dto.status !== undefined && { status: dto.status }),
    ...(dto.source !== undefined && { source: dto.source }),
    ...(dto.raw_text !== undefined && { rawText: dto.raw_text }),
    ...(dto.captured_at !== undefined && {
      capturedAt: dto.captured_at === null ? null : new Date(dto.captured_at),
    }),
    ...(dto.por_revisar !== undefined && { needsReview: dto.por_revisar }),
  };
}
