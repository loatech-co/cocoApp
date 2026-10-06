/**
 * The pieces of the dashboard summary that need no database: the breakdown by
 * category, the trend, the month's pending payments and the account totals.
 * `DashboardService.summary` reads the data and composes these.
 */
import {
  ancestorAtLevel,
  bucketOf,
  rangeBuckets,
  granularityFor,
  type FlatCategory,
} from './dashboard.aggregate';
import type { CategorySpend, PendingPayment, TrendPoint } from './dashboard.types';
import { pendingOutcome, expectedForMonth, isDueInMonth, dueDate } from './pending';
import { ZERO, serialize, toMoney, type Money } from '../../common/money/money';
import type { Account } from '../accounts/accounts.service';
import type { SummaryCategory } from '../categories/category-lookup.service';
import type { MonthlyHistory, SummaryMovement } from '../transactions/ledger.service';

/** One row of a breakdown level, before it gets a name. */
interface GroupedRow {
  id: bigint | null;
  total: Money;
  count: number;
}

type Grouped = Map<string, GroupedRow>;

/** The tree, indexed by id: positions and the data of each category. */
export interface Tree {
  byId: ReadonlyMap<string, FlatCategory>;
  dataById: ReadonlyMap<string, SummaryCategory>;
}

export function treeOf(categories: readonly SummaryCategory[]): Tree {
  return {
    byId: new Map(categories.map((c) => [c.id.toString(), { id: c.id, parentId: c.parentId }])),
    dataById: new Map(categories.map((c) => [c.id.toString(), c])),
  };
}

/**
 * The month's range in `America/Bogota` (UTC−5, no daylight saving).
 *
 * Making it explicit matters: if the bounds were computed in UTC, an expense
 * on the 31st at 8 p.m. Bogotá time would fall in the next month and the user
 * would see their money in the wrong month.
 */
export function defaultRange(from?: string, to?: string): { start: Date; end: Date } {
  const nowInBogota = new Date(Date.now() - 5 * 60 * 60 * 1000);

  // By default: from the 1st of the current month to today. It is
  // "month to date", which answers the question one asks every day —"how am I
  // doing this month?"— without mixing in days that have not happened yet.
  const start = from
    ? new Date(`${from}T00:00:00.000Z`)
    : new Date(Date.UTC(nowInBogota.getUTCFullYear(), nowInBogota.getUTCMonth(), 1));

  const end = to
    ? new Date(`${to}T00:00:00.000Z`)
    : new Date(
        Date.UTC(nowInBogota.getUTCFullYear(), nowInBogota.getUTCMonth(), nowInBogota.getUTCDate()),
      );

  return { start, end };
}

export const toIsoDate = (date: Date): string => date.toISOString().slice(0, 10);

/** The level a category is at: 1 center, 2 category, 3 concept. */
function categoryDepth(byId: ReadonlyMap<string, FlatCategory>, id: bigint): number {
  let level = 0;
  let current: bigint | null = id;
  const visited = new Set<string>();

  while (current !== null) {
    const key = current.toString();
    if (visited.has(key)) break;
    visited.add(key);
    level += 1;
    current = byId.get(key)?.parentId ?? null;
  }

  return level;
}

// ── Breakdown, lifting each movement to the level it belongs to ────────────

function groupAtLevel(
  movements: readonly SummaryMovement[],
  byId: ReadonlyMap<string, FlatCategory>,
  level: number,
): Grouped {
  const accumulated: Grouped = new Map();

  for (const m of movements) {
    if (m.type !== 'expense') continue;

    // With splits, each part can go to a different category.
    const parts =
      m.splits.length > 0
        ? m.splits.map((s) => ({ categoryId: s.categoryId, amount: toMoney(s.amount) }))
        : [{ categoryId: m.categoryId, amount: toMoney(m.amount) }];

    for (const part of parts) {
      const target = ancestorAtLevel(byId, part.categoryId, level);
      const key = target?.toString() ?? 'sin';
      const current = accumulated.get(key) ?? { id: target, total: ZERO, count: 0 };
      accumulated.set(key, {
        id: target,
        total: current.total.plus(part.amount),
        count: current.count + 1,
      });
    }
  }

  return accumulated;
}

/** A grouped level, ready to go out: named, from largest to smallest. */
function toRows(grouped: Grouped, dataById: ReadonlyMap<string, SummaryCategory>): CategorySpend[] {
  return [...grouped.values()]
    .map((row) => {
      const data = row.id === null ? undefined : dataById.get(row.id.toString());
      return {
        categoryId: row.id,
        name: data?.name ?? 'Sin clasificar',
        color: data?.color ?? null,
        icon: data?.icon ?? null,
        total: serialize(toMoney(row.total)),
        count: row.count,
      };
    })
    .sort((a, b) => Number(b.total) - Number(a.total));
}

/**
 * The breakdown one level below what is being looked at, going further down
 * while a level has a single row, plus the spending by cost center.
 */
export function breakdown(
  movements: readonly SummaryMovement[],
  tree: Tree,
  singleRequested: bigint | undefined,
): {
  byCategory: CategorySpend[];
  byCostCenter: CategorySpend[];
  shownLevel: number;
  parent: bigint | null;
} {
  // The breakdown goes one level below what is being looked at: with no
  // filter it groups by center; inside a center, by category; inside a
  // category, by concept. Inside a concept there is nowhere further down.
  //
  // With SEVERAL categories selected there is no single "inside of": two
  // different centers share no lower level. It goes down a level only when
  // the selection is a single thing; otherwise it breaks down by center, which
  // is the question that still has an answer.
  const filteredLevel =
    singleRequested === undefined ? 0 : categoryDepth(tree.byId, singleRequested);
  const drilled = drillWhileSingleRow(
    (level) => groupAtLevel(movements, tree.byId, level),
    Math.min(filteredLevel + 1, 3),
    singleRequested ?? null,
  );

  return {
    byCategory: toRows(drilled.accumulated, tree.dataById),
    /*
      Fixed against variable.

      The names come from the CENTERS, not from a list written here: whoever
      called them "Costos fijos" and "Costos variables" can call them
      something else tomorrow, and the indicator has to keep telling the
      truth.

      Level 1 is computed again instead of reusing `accumulated` because that
      one may already have gone down: when only one center has expense, its
      rows are categories, and there is nothing left there to answer this
      question with.
    */
    byCostCenter: toRows(groupAtLevel(movements, tree.byId, 1), tree.dataById),
    shownLevel: drilled.shownLevel,
    parent: drilled.parent,
  };
}

/*
  ── If this level has only ONE row, go down to the next ─────────────────

  A one-row breakdown breaks nothing down: it says "100 % of your money is
  in the only place it can be". It happens all the time at the start, when
  there is a single cost center, and also when filtering by one.

  It keeps going down while the answer is still a single row, until it
  reaches the concepts, where there is nothing further down.
*/
function drillWhileSingleRow(
  groupAt: (level: number) => Grouped,
  startLevel: number,
  requested: bigint | null,
): { accumulated: Grouped; shownLevel: number; parent: bigint | null } {
  let shownLevel = startLevel;
  let accumulated = groupAt(shownLevel);
  // Whose rows end up shown. With a filter set it is already known;
  // otherwise the single row it goes down through will say.
  let parent = requested;

  const singleRowOf = (rows: Grouped) => (rows.size === 1 ? [...rows.values()][0] : undefined);

  for (
    let single = singleRowOf(accumulated);
    shownLevel < 3 && single !== undefined && single.id !== null;
    single = singleRowOf(accumulated)
  ) {
    const below = groupAt(shownLevel + 1);
    /*
      It goes down even if below there is also only ONE row.

      It used to stop when the level below had no more rows than the one
      above, and that left exactly the most common case stuck: a single cost
      center with a single category kept showing the center, which is the row
      that says nothing. "Costos fijos, 100 %" was known before looking.

      The only reason not to go down is that there are no names below: if
      everything in this center is classified in the center itself and in
      none of its categories, going down would swap a real name for a
      "Sin clasificar" that tells less.
    */
    const hasNamesBelow = [...below.values()].some((f) => f.id !== null);
    if (!hasNamesBelow) break;
    parent = single.id;
    shownLevel += 1;
    accumulated = below;
  }

  return { accumulated, shownLevel, parent };
}

// ── Trend ───────────────────────────────────────────────────────────────────

export function trend(
  movements: readonly SummaryMovement[],
  start: Date,
  end: Date,
): { granularity: 'day' | 'month'; points: TrendPoint[] } {
  const granularity = granularityFor(start, end);
  const buckets = new Map(
    rangeBuckets(start, end, granularity).map((b) => [
      b,
      { expense: ZERO, income: ZERO, count: 0 },
    ]),
  );

  const keys = [...buckets.keys()];
  const firstBucket = keys[0];
  const lastBucket = keys[keys.length - 1];

  for (const m of movements) {
    // Transfers are neither expense nor income: they only change pockets.
    if (m.type === 'transfer') continue;

    // ── Why the bucket date depends on the granularity ────────────────────
    // `period` is the MONTH the expense belongs to, and as a date it is
    // always the 1st. On a month axis that is exactly what is wanted. On a
    // DAY axis, however, every August movement fell on 1 August: the line
    // spiked on the first day and stayed flat for the rest, even though the
    // payments were on the 13th and the 25th.
    const when = granularity === 'day' ? m.date : m.period;

    let bucket = bucketOf(when, granularity);

    if (!buckets.has(bucket)) {
      // The payment fell outside the axis: the March bill paid on 6 April
      // enters the range by its period, but its day does not exist on a
      // March axis. It is moved to the nearest edge instead of being dropped —
      // if it were dropped, the line would add up to less than the total
      // above and the two figures on the same screen would contradict each
      // other.
      // With no axis there is no edge to move it to; below there would be no
      // bucket either.
      if (firstBucket === undefined || lastBucket === undefined) continue;
      bucket = bucketOf(when, granularity) < firstBucket ? firstBucket : lastBucket;
    }

    const current = buckets.get(bucket);
    if (!current) continue;
    const amount = toMoney(m.amount);
    current.count += 1;
    if (m.type === 'expense') current.expense = current.expense.plus(amount);
    else current.income = current.income.plus(amount);
  }

  const points = [...buckets.entries()].map(([bucket, v]) => ({
    bucket,
    expense: serialize(toMoney(v.expense)),
    income: serialize(toMoney(v.income)),
    net: serialize(toMoney(v.income.minus(v.expense))),
    count: v.count,
  }));
  return { granularity, points };
}

// ── What is left to pay this month ──────────────────────────────────────────

/** A recurring concept that can be due: it has a periodicity. */
export type RecurringConcept = SummaryCategory & {
  periodicity: NonNullable<SummaryCategory['periodicity']>;
};

/*
  ARCHIVED concepts do not come in here, and the word «here» is the whole
  rule.

  Archiving a concept says «this is not coming back»: the gym membership
  that was cancelled, the insurance of the car that was sold. Asking for it
  every month in pending payments asks for something nobody will ever pay,
  and that row could only leave the list by unarchiving the concept —the
  opposite of what was intended—.

  But it only leaves THIS list and the month's budget. What the concept
  cost in the months it was alive still counts in the donut, the totals and
  the trend: archiving looks forward and does not rewrite what already
  happened. That is why the filter goes here and not in the categories
  query, which is what the historical figures read from.
*/
export function liveRecurring(categories: readonly SummaryCategory[]): RecurringConcept[] {
  return categories.filter(
    (c): c is RecurringConcept => c.isRecurring && c.periodicity !== null && !c.isArchived,
  );
}

/*
  ── What is needed this month ───────────────────────────────────────────
  The sum of ALL recurring concepts due this month, paid or not. The
  question is "how much money do I need this month?", and that is why what
  was already paid counts: a budget that shrinks every time one pays
  something is not a budget, it is the outstanding balance —and the pending
  payments card already says that, from this very same pass—.

  What was paid comes in at what it REALLY cost this month; what is
  missing, at what it cost last time, which is the only thing known in
  advance.
*/
export function pendingThisMonth(
  recurring: readonly RecurringConcept[],
  data: { history: MonthlyHistory; paidThisMonth: ReadonlyMap<string, Money> },
  currentMonth: string,
  tree: Tree,
): { pending: PendingPayment[]; budget: Money } {
  const pending: PendingPayment[] = [];
  let budget = ZERO;

  for (const concept of recurring) {
    // First whether it is due this month: a quarterly one that does not fall
    // here neither counts for the budget nor shows as pending.
    if (!isDueInMonth(concept.periodicity, concept.paymentMonth, currentMonth)) continue;

    const key = concept.id.toString();
    const paid = data.paidThisMonth.get(key);

    // The SAME figure shown in the pending list: if the budget were
    // estimated another way, the two cards on the same screen would say
    // different things about the same money.
    //
    // And the concept's budget, when it has one, beats the average.
    // See `expectedForMonth`.
    const expected = expectedForMonth(
      concept.budget === null ? null : toMoney(concept.budget),
      data.history.get(key) ?? new Map(),
      currentMonth.slice(0, 7),
    );

    // Whether it is still due and how much it adds to the budget are decided
    // by a single function, because the two answers have to agree with each
    // other: a concept that leaves the list for being covered cannot enter
    // the budget at what was expected.
    const outcome = pendingOutcome({
      isMultiPayment: concept.isMultiPayment,
      hasPayment: paid !== undefined,
      paid: paid ?? ZERO,
      expected,
    });

    budget = budget.plus(outcome.towardBudget);
    if (!outcome.isStillDue) continue;

    pending.push(pendingPaymentOf(concept, expected, paid, currentMonth, tree));
  }

  // By date: what is due first is what needs looking at first.
  pending.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return { pending, budget };
}

function pendingPaymentOf(
  concept: RecurringConcept,
  expected: Money | null,
  paid: Money | undefined,
  currentMonth: string,
  tree: Tree,
): PendingPayment {
  // The full path: "Alquiler" alone does not say which center it hangs
  // from. And on the way the ROOT shows up, which is the cost center: it is
  // what says whether this is fixed or variable.
  const ancestors: string[] = [];
  let current = tree.byId.get(concept.id.toString());
  let root = concept.id.toString();
  while (current?.parentId) {
    const parent = tree.dataById.get(current.parentId.toString());
    if (!parent) break;
    ancestors.unshift(parent.name);
    root = current.parentId.toString();
    current = tree.byId.get(current.parentId.toString());
  }

  return {
    categoryId: concept.id,
    name: concept.name,
    path: ancestors.join(' · '),
    periodicity: concept.periodicity,
    dueDate: dueDate(currentMonth, concept.paymentDay),
    expectedAmount: expected === null ? null : serialize(toMoney(expected)),
    costCenterId: BigInt(root),
    costCenter: tree.dataById.get(root)?.name ?? '',
    // Always, in the normal ones too —where it is zero—, so the screen does
    // not have to wonder whether the field is there.
    paidAmount: serialize(paid ?? ZERO),
    isMultiPayment: concept.isMultiPayment,
  };
}

/** Assets (every non-credit account), debts (credit cards) and net worth. */
export function totalsOf(accounts: readonly Account[]): {
  assets: string;
  debts: string;
  netWorth: string;
} {
  const assets = accounts
    .filter((c) => c.type !== 'credit')
    .reduce((total, c) => total.plus(toMoney(c.balance)), ZERO);
  const debts = accounts
    .filter((c) => c.type === 'credit')
    .reduce((total, c) => total.plus(toMoney(c.balance)), ZERO);

  return {
    assets: serialize(toMoney(assets)),
    debts: serialize(toMoney(debts)),
    netWorth: serialize(toMoney(assets.minus(debts))),
  };
}
