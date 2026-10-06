import { Injectable } from '@nestjs/common';

import type { AutoCharge, MonthlyHistory, SummaryFilter, SummaryMovement } from './ledger.types';
import { ZERO, toMoney, type Money } from '../../common/money/money';
import { Database } from '../../prisma/database';

/** The reads and writes other modules need from the transactions table. */
@Injectable()
export class LedgerRepository {
  constructor(private readonly db: Database) {}

  async findIdByExternalRef(userId: bigint, externalRef: string): Promise<bigint | null> {
    const row = await this.db.forUser(userId, (tx) =>
      tx.transaction.findFirst({ where: { userId, externalRef }, select: { id: true } }),
    );
    return row?.id ?? null;
  }

  /** The most recent categorized movements with a description, newest first. */
  findCategorizedHistory(
    userId: bigint,
    take: number,
  ): Promise<{ description: string | null; categoryId: bigint | null }[]> {
    return this.db.forUser(userId, (tx) =>
      tx.transaction.findMany({
        where: { userId, categoryId: { not: null }, description: { not: null } },
        select: { description: true, categoryId: true },
        orderBy: { date: 'desc' },
        take,
      }),
    );
  }

  findForSummary(userId: bigint, filter: SummaryFilter): Promise<SummaryMovement[]> {
    const { from, to, branch, q, byName } = filter;
    return this.db.forUser(userId, (tx) =>
      tx.transaction.findMany({
        where: {
          userId,
          // By PERIOD, not by payment date: March's bill paid on April 6
          // belongs to March, and March is where one looks for it.
          period: { gte: from, lte: to },
          ...(branch && { categoryId: { in: branch } }),
          ...(q && {
            OR: [
              { description: { contains: q, mode: 'insensitive' as const } },
              { merchant: { contains: q, mode: 'insensitive' as const } },
              { notes: { contains: q, mode: 'insensitive' as const } },
              ...(byName.length > 0 ? [{ categoryId: { in: byName } }] : []),
            ],
          }),
        },
        select: {
          date: true,
          period: true,
          type: true,
          amount: true,
          categoryId: true,
          splits: { select: { categoryId: true, amount: true } },
        },
      }),
    );
  }

  /**
   * What each concept cost in each month BEFORE `before`. A month with two
   * payments adds both: the month cost what it cost, not what one of the
   * receipts cost.
   *
   * Only what the estimate reads (ADR 0017): the months since `since`, and,
   * for the concept that has nothing there, its LAST month with a payment,
   * which is what the estimate falls back to. It used to load the whole
   * history, and the summary got slower with every year of data without any
   * figure changing.
   */
  async monthlyHistory(
    userId: bigint,
    categoryIds: readonly bigint[],
    { before, since }: { before: Date; since: Date },
  ): Promise<MonthlyHistory> {
    const history = await this.db.forUser(userId, async (tx) => {
      // The last period of each concept: an aggregate in the database, no rows loaded.
      const ultimos = await tx.transaction.groupBy({
        by: ['categoryId'],
        where: { userId, categoryId: { in: [...categoryIds] }, period: { lt: before } },
        _max: { period: true },
      });

      const ranges = ultimos.flatMap(({ categoryId, _max }) =>
        categoryId === null || _max.period === null
          ? []
          : [{ categoryId, period: { gte: sinceForConcept(_max.period, since), lt: before } }],
      );
      if (ranges.length === 0) return [];

      return tx.transaction.findMany({
        where: { userId, OR: ranges },
        select: { categoryId: true, amount: true, period: true },
      });
    });

    const historyByCategory: MonthlyHistory = new Map();
    for (const t of history) {
      const key = t.categoryId?.toString();
      if (key === undefined) continue;
      const monthKey = t.period.toISOString().slice(0, 7);
      const months = historyByCategory.get(key) ?? new Map<string, Money>();
      months.set(monthKey, (months.get(monthKey) ?? ZERO).plus(toMoney(t.amount)));
      historyByCategory.set(key, months);
    }
    return historyByCategory;
  }

  /**
   * What was already paid in that month and CLEARED (`cleared`), added up per
   * concept: the same recurring concept may have been paid in two parts.
   */
  async clearedInMonth(
    userId: bigint,
    categoryIds: readonly bigint[],
    month: Date,
  ): Promise<Map<string, Money>> {
    const paidRows = await this.db.forUser(userId, (tx) =>
      tx.transaction.findMany({
        where: {
          userId,
          categoryId: { in: [...categoryIds] },
          period: { gte: month, lte: month },
          status: 'cleared',
        },
        select: { categoryId: true, amount: true },
      }),
    );

    const paid = new Map<string, Money>();
    for (const t of paidRows) {
      const key = t.categoryId?.toString();
      if (key === undefined) continue;
      paid.set(key, (paid.get(key) ?? ZERO).plus(toMoney(t.amount)));
    }
    return paid;
  }

  /** Which of these concepts already have a movement in that period, in ANY status. */
  async categoriesWithMovementIn(
    userId: bigint,
    categoryIds: readonly bigint[],
    period: Date,
  ): Promise<Set<string | undefined>> {
    const existing = await this.db.forUser(userId, (tx) =>
      tx.transaction.findMany({
        where: { userId, categoryId: { in: [...categoryIds] }, period },
        select: { categoryId: true },
      }),
    );
    return new Set(existing.map((t) => t.categoryId?.toString()));
  }

  /**
   * Writes an automatic charge. `false` when its unique `external_ref` was
   * already taken: two runs racing for the same charge, the first one won.
   */
  async createAutoCharge(charge: AutoCharge): Promise<boolean> {
    try {
      await this.db.forUser(charge.userId, (tx) =>
        tx.transaction.create({ data: { ...charge, type: 'expense', status: 'cleared' } }),
      );
      return true;
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') return false;
      throw error;
    }
  }
}

/**
 * From where a concept's history has to be read: `since` when its last payment
 * falls inside the window, or the first day of the month of that last payment
 * when it is older, so the fallback month comes back whole.
 */
function sinceForConcept(last: Date, since: Date): Date {
  const lastMonthStart = new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), 1));
  return lastMonthStart < since ? lastMonthStart : since;
}
