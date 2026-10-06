import { ZERO, toMoney, type Money } from '../../common/money/money';
import type { TransactionType } from '../../generated/prisma/client';

export interface AggregableMovement {
  type: TransactionType;
  amount: Money;
  categoryId: bigint | null;
  splits: { categoryId: bigint | null; amount: Money }[];
}

export interface PeriodFlow {
  income: Money;
  expense: Money;
  net: Money;
}

/**
 * The period's flow.
 *
 * TRANSFERS are left out on purpose: moving money from savings to the
 * checking account is neither income nor expense, it only changes pockets.
 * Counting them would inflate both figures and the user would see a month in
 * which they "earned" and "spent" money that never entered or left their net
 * worth.
 */
export function computeFlow(movements: readonly AggregableMovement[]): PeriodFlow {
  let income = ZERO;
  let expense = ZERO;

  for (const movement of movements) {
    if (movement.type === 'income') income = income.plus(movement.amount);
    else if (movement.type === 'expense') expense = expense.plus(movement.amount);
  }

  return {
    income: toMoney(income),
    expense: toMoney(expense),
    net: toMoney(income.minus(expense)),
  };
}

export interface ExpenseByCategory {
  category_id: bigint | null;
  total: Money;
  count: number;
}

/**
 * Spreads the expense across categories.
 *
 * When a movement has splits, the source of truth for the distribution is the
 * splits, NOT the header `category_id`: if a $150,000 purchase was split into
 * groceries and cleaning, counting it whole in a single category would falsify
 * both figures.
 *
 * Movements without a category are not dropped: they are grouped under `null`
 * so the user sees them and can classify them. Hiding them would make the
 * total by category not match the real expense, which is worse than showing
 * them.
 */
export function computeExpenseByCategory(
  movements: readonly AggregableMovement[],
): ExpenseByCategory[] {
  const accumulated = new Map<string, { categoryId: bigint | null; total: Money; count: number }>();

  const accumulate = (categoryId: bigint | null, amount: Money): void => {
    const key = categoryId === null ? 'sin-categoria' : categoryId.toString();
    const current = accumulated.get(key) ?? { categoryId, total: ZERO, count: 0 };

    accumulated.set(key, {
      categoryId,
      total: current.total.plus(amount),
      count: current.count + 1,
    });
  };

  for (const movement of movements) {
    if (movement.type !== 'expense') continue;

    if (movement.splits.length > 0) {
      for (const split of movement.splits) {
        accumulate(split.categoryId, split.amount);
      }
    } else {
      accumulate(movement.categoryId, movement.amount);
    }
  }

  return [...accumulated.values()]
    .map((entry) => ({
      category_id: entry.categoryId,
      total: toMoney(entry.total),
      count: entry.count,
    }))
    .sort((a, b) => b.total.comparedTo(a.total));
}

// ═══════════════════════════════════════════════════════════════════════════
// Three-level hierarchy and trend
// ═══════════════════════════════════════════════════════════════════════════

/** The least of a category needed to climb its ancestors. */
export interface FlatCategory {
  id: bigint;
  parentId: bigint | null;
}

/**
 * Climbs from a category to the ancestor at `targetLevel`.
 *
 * Movements hang from the CONCEPT, which is level 3. To answer "how much went
 * on utilities?" you have to climb from the concept to its category; for "how
 * much on fixed costs?", up to the center. Without this, a breakdown by center
 * would come out empty: no movement points at a center.
 *
 * Returns `null` if the category does not reach that level —a concept hanging
 * straight from the root has no category— and the caller decides what to do.
 */
export function ancestorAtLevel(
  categories: ReadonlyMap<string, FlatCategory>,
  categoryId: bigint | null,
  targetLevel: number,
): bigint | null {
  if (categoryId === null) return null;

  // Climb to the root keeping the path, then read it by index.
  const chain: bigint[] = [];
  let current: bigint | null = categoryId;
  const visited = new Set<string>();

  while (current !== null) {
    const key = current.toString();
    if (visited.has(key)) break;
    visited.add(key);
    chain.unshift(current);
    current = categories.get(key)?.parentId ?? null;
  }

  // chain[0] is level 1. If the branch is shorter than the level asked for,
  // there is no such ancestor.
  return chain[targetLevel - 1] ?? null;
}

/**
 * How many days the range covers, both ends included.
 */
export function daysInRange(from: Date, to: Date): number {
  const MS = 24 * 60 * 60 * 1000;
  return Math.floor((to.getTime() - from.getTime()) / MS) + 1;
}

/** How many calendar months the range touches, both ends included. */
function monthsInRange(from: Date, to: Date): number {
  return (
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth()) + 1
  );
}

/**
 * The trend's bucket size, by how wide the range is.
 *
 * A year in daily buckets is 365 points: the line turns into noise and no
 * trend can be read. A month in monthly buckets is ONE point, which says
 * nothing either. The cut is at THREE MONTHS.
 *
 * CALENDAR MONTHS are counted, not days, on purpose. Counting days, "the last
 * 3 months" fell on one side of the cut or the other depending on the month
 * it was viewed in —February to April is 61 days and May to July is 92— and
 * the same button sometimes drew a line of days and sometimes one of months.
 * The time axis cannot change its unit depending on the current month.
 */
export function granularityFor(from: Date, to: Date): 'day' | 'month' {
  return monthsInRange(from, to) < 3 ? 'day' : 'month';
}

/** The label of the bucket a date falls in: `2025-03-14` or `2025-03`. */
export function bucketOf(date: Date, granularity: 'day' | 'month'): string {
  const iso = date.toISOString().slice(0, 10);
  return granularity === 'day' ? iso : iso.slice(0, 7);
}

/**
 * Every bucket of the range, the EMPTY ones included.
 *
 * Months without expense have to show up with zero. If they were left out,
 * the line would join March with May and draw a gentle slope where there was
 * really a blank month: the shape of the curve would lie.
 */
export function rangeBuckets(from: Date, to: Date, granularity: 'day' | 'month'): string[] {
  const buckets: string[] = [];
  const cursor = new Date(
    Date.UTC(
      from.getUTCFullYear(),
      from.getUTCMonth(),
      granularity === 'day' ? from.getUTCDate() : 1,
    ),
  );

  while (cursor <= to) {
    buckets.push(bucketOf(cursor, granularity));
    if (granularity === 'day') cursor.setUTCDate(cursor.getUTCDate() + 1);
    else cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return buckets;
}
