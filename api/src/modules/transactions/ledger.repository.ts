import { Injectable } from '@nestjs/common';

import type { AutoCharge, MonthlyHistory, SummaryFilter, SummaryMovement } from './ledger.types';
import { ZERO, toMoney, type Money } from '../../common/money/money';
import type { Prisma } from '../../generated/prisma/client';
import { Database } from '../../prisma/database';

/** A row with what a concept filter has to see of it. */
interface ConceptRow {
  categoryId: bigint | null;
  amount: Prisma.Decimal;
  splits: { categoryId: bigint | null; amount: Prisma.Decimal }[];
}

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
          ...(branch && { AND: [inConcepts(branch)] }),
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
      const lastPeriods = await this.lastPeriodByConcept(tx, userId, categoryIds, before);
      const ranges = [...lastPeriods].map(([categoryId, last]) => ({
        ...inConcepts([categoryId]),
        period: { gte: sinceForConcept(last, since), lt: before },
      }));
      if (ranges.length === 0) return [];

      return tx.transaction.findMany({
        where: { userId, type: 'expense', OR: ranges },
        select: { categoryId: true, amount: true, period: true, splits: SPLIT_PARTS },
      });
    });

    const wanted = new Set(categoryIds.map(String));
    const historyByCategory: MonthlyHistory = new Map();
    for (const row of history) {
      const monthKey = row.period.toISOString().slice(0, 7);
      for (const part of conceptParts(row)) {
        if (!wanted.has(part.key)) continue;
        const months = historyByCategory.get(part.key) ?? new Map<string, Money>();
        months.set(monthKey, (months.get(monthKey) ?? ZERO).plus(part.amount));
        historyByCategory.set(part.key, months);
      }
    }
    return historyByCategory;
  }

  /**
   * The last period each concept was paid in, whether the row carries the
   * concept itself or one of its splits does. Two aggregates, no rows loaded.
   */
  private async lastPeriodByConcept(
    tx: Prisma.TransactionClient,
    userId: bigint,
    categoryIds: readonly bigint[],
    before: Date,
  ): Promise<Map<bigint, Date>> {
    const ids = [...categoryIds];
    const [own, viaSplits] = await Promise.all([
      tx.transaction.groupBy({
        by: ['categoryId'],
        where: { userId, type: 'expense', categoryId: { in: ids }, period: { lt: before } },
        _max: { period: true },
      }),
      tx.transactionSplit.findMany({
        where: {
          categoryId: { in: ids },
          transaction: { userId, type: 'expense', period: { lt: before } },
        },
        orderBy: { transaction: { period: 'desc' } },
        distinct: ['categoryId'],
        select: { categoryId: true, transaction: { select: { period: true } } },
      }),
    ]);

    const last = new Map<bigint, Date>();
    const keep = (categoryId: bigint | null, period: Date | null) => {
      if (categoryId === null || period === null) return;
      const known = last.get(categoryId);
      if (known === undefined || known < period) last.set(categoryId, period);
    };
    for (const group of own) keep(group.categoryId, group._max.period);
    for (const split of viaSplits) keep(split.categoryId, split.transaction.period);
    return last;
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
          type: 'expense',
          ...inConcepts(categoryIds),
          period: { gte: month, lte: month },
          status: 'cleared',
        },
        select: { categoryId: true, amount: true, splits: SPLIT_PARTS },
      }),
    );

    const wanted = new Set(categoryIds.map(String));
    const paid = new Map<string, Money>();
    for (const row of paidRows) {
      for (const part of conceptParts(row)) {
        if (!wanted.has(part.key)) continue;
        paid.set(part.key, (paid.get(part.key) ?? ZERO).plus(part.amount));
      }
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
        where: { userId, type: 'expense', ...inConcepts(categoryIds), period },
        select: { categoryId: true, amount: true, splits: SPLIT_PARTS },
      }),
    );
    const wanted = new Set(categoryIds.map(String));
    return new Set(
      existing.flatMap((row) => conceptParts(row).map((p) => p.key)).filter((k) => wanted.has(k)),
    );
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

const SPLIT_PARTS = { select: { categoryId: true, amount: true } } as const;

/**
 * A row belongs to a concept through its own category or through one of its
 * splits: a split payment is still a payment of that concept.
 */
function inConcepts(categoryIds: readonly bigint[]): Prisma.TransactionWhereInput {
  const ids = [...categoryIds];
  return { OR: [{ categoryId: { in: ids } }, { splits: { some: { categoryId: { in: ids } } } }] };
}

/**
 * What a row pays to which concept. With splits, the splits are the source,
 * as in the dashboard breakdown: counting the header whole would count a
 * purchase split across concepts for each of them in full.
 */
function conceptParts(row: ConceptRow): { key: string; amount: Money }[] {
  const parts = row.splits.length > 0 ? row.splits : [row];
  return parts.flatMap((part) =>
    part.categoryId === null
      ? []
      : [{ key: part.categoryId.toString(), amount: toMoney(part.amount) }],
  );
}
