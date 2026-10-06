import { Injectable } from '@nestjs/common';

import type {
  CaptureOutcome,
  DuplicateCandidateRow,
  DuplicateCriteria,
  NewTransaction,
  TwinVerdict,
} from './ledger.types';
import { writeDetails } from './transactions.repository';
import { DuplicateError } from '../../common/errors/domain-error';
import { Prisma } from '../../generated/prisma/client';
import { Database } from '../../prisma/database';

/**
 * The write of a Wallet or SMS capture: look for the other side of the same
 * payment and, in the SAME database transaction, merge into it or insert.
 */
@Injectable()
export class CaptureRepository {
  constructor(private readonly db: Database) {}

  /**
   * ── Why the lock ──────────────────────────────────────────────────────────
   * Wallet and the SMS of the same payment arrive almost at once. Without a
   * lock, both captures look for the twin, neither sees the other —it has not
   * been written yet— and both insert: the expense ends up duplicated.
   *
   * `pg_advisory_xact_lock` queues the captures of the same person and the
   * same amount, and is released on its own when the transaction ends. The
   * second one waits, and when it gets in it already sees the first one's row
   * (READ COMMITTED reads what is committed at each statement). The key holds
   * person and amount, not the date: the duplicate window crosses days
   * (`days` is ±1), and a key with the date would let two captures of
   * neighbouring days through at once. What every candidate shares is the
   * amount, and that is enough to cover it.
   *
   * Everything goes through `tx`: a read on another connection, with the lock
   * held, can be left without a free connection in the pool and never come
   * back. And `tx` is the unit of `forUser` (ADR 0019): the lock is its first
   * statement after setting the user, so it covers the search and the write
   * with row-level security on. A separate transaction would leave it out.
   *
   * A clash on the unique `external_ref` becomes a DuplicateError, as in
   * `createWithDetails`.
   */
  async createUnlessTwin(
    movement: NewTransaction,
    criteria: DuplicateCriteria,
    decide: (candidates: DuplicateCandidateRow[]) => TwinVerdict,
  ): Promise<CaptureOutcome> {
    try {
      return await this.db.forUser(criteria.userId, async (tx) => {
        await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${captureLockKey(criteria)}::text, 0))`;

        const verdict = decide(await tx.transaction.findMany(duplicateCandidatesQuery(criteria)));
        if (verdict.kind === 'merge') {
          if (Object.keys(verdict.changes).length > 0) {
            await tx.transaction.update({ where: { id: verdict.id }, data: verdict.changes });
          }
          return { kind: 'merged', id: verdict.id };
        }

        const shouldReview = movement.data.needsReview === true || verdict.flag;
        const created = await tx.transaction.create({
          data: { ...movement.data, needsReview: shouldReview },
          select: { id: true },
        });
        await writeDetails(tx, created.id, movement.splits, movement.tagIds);
        return { kind: 'created', id: created.id };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new DuplicateError();
      }
      throw error;
    }
  }
}

/** One lock per person and amount: every candidate of a capture shares both. */
function captureLockKey(criteria: DuplicateCriteria): string {
  return `capture:${criteria.userId.toString()}:${criteria.amount.toFixed(2)}`;
}

/**
 * Same person, same amount, another source, close in date and in time.
 * Without a capture time, by the creation one. Twenty at most.
 */
function duplicateCandidatesQuery(criteria: DuplicateCriteria) {
  const { userId, source, amount, days, window } = criteria;
  return {
    where: {
      userId,
      amount,
      source: { not: source },
      date: { gte: days.from, lte: days.to },
      OR: [
        { capturedAt: { gte: window.from, lte: window.to } },
        { capturedAt: null, createdAt: { gte: window.from, lte: window.to } },
      ],
    },
    select: {
      id: true,
      source: true,
      date: true,
      amount: true,
      capturedAt: true,
      createdAt: true,
      rawText: true,
      merchant: true,
      description: true,
    },
    take: 20,
  } satisfies Prisma.TransactionFindManyArgs;
}
