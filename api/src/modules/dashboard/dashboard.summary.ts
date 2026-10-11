/**
 * The pieces of the dashboard summary that need no database: the category
 * tree, the range, the breakdown by category and the account totals. The trend
 * and the month's pending payments live next door (`dashboard.trend.ts`,
 * `dashboard.pending.ts`). `DashboardService.summary` reads the data and
 * composes these.
 */
import { ancestorAtLevel, type FlatCategory } from './dashboard.aggregate';
import type { CategorySpend } from './dashboard.types';
import { ZERO, serialize, toMoney, type Money } from '../../common/money/money';
import type { Account } from '../accounts/accounts.service';
import type { SummaryCategory } from '../categories/category-lookup.service';
import type { SummaryMovement } from '../transactions/ledger.service';

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
