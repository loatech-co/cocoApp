import { Injectable } from '@nestjs/common';

import { computeFlow, type AggregableMovement } from './dashboard.aggregate';
import type { DashboardQueryDto } from './dashboard.dto';
import {
  toIsoDate,
  treeOf,
  breakdown,
  pendingThisMonth,
  defaultRange,
  liveRecurring,
  trend,
  totalsOf,
  type Tree,
} from './dashboard.summary';
import type { Dashboard, PendingPayment } from './dashboard.types';
import { historyWindow } from './pending';
import { categoryIds, branchesOf } from '../../common/categories/categories.tree';
import { ZERO, serialize, toMoney, type Money } from '../../common/money/money';
import { Database } from '../../prisma/database';
import { AccountsService } from '../accounts/accounts.service';
import { CategoryLookupService, type SummaryCategory } from '../categories/category-lookup.service';
import { LedgerService, type SummaryMovement } from '../transactions/ledger.service';

@Injectable()
export class DashboardService {
  constructor(
    private readonly categories: CategoryLookupService,
    private readonly ledger: LedgerService,
    private readonly accounts: AccountsService,
    private readonly db: Database,
  ) {}

  /**
   * One unit of work for the whole summary: its six reads share one
   * transaction instead of opening one each. Measured in ADR 0019: the
   * per-unit BEGIN/set_config/COMMIT, not the policies, is what RLS costs,
   * and this screen is the one that pays it six times.
   */
  summary(userId: bigint, query: DashboardQueryDto): Promise<Dashboard> {
    return this.db.forUser(userId, () => this.readSummary(userId, query));
  }

  private async readSummary(userId: bigint, query: DashboardQueryDto): Promise<Dashboard> {
    const { start, end } = defaultRange(query.from, query.to);

    // A GET only reads. Auto-paid concepts are charged by AutoChargeTask, once
    // a day and at start-up (phase 6.7), not on the way in here.

    const categories = await this.categories.findForSummary(userId);
    const tree = treeOf(categories);
    const flat = [...tree.byId.values()];

    // Filtering by categories brings their WHOLE branch: movements hang from
    // the concept, never from the center or the category.
    const requested = [
      ...(query.category_id !== undefined ? [BigInt(query.category_id)] : []),
      ...categoryIds(query.category_ids),
    ];

    const [accounts, movements] = await Promise.all([
      this.accounts.list(userId, false),
      this.ledger.findForSummary(userId, {
        from: start,
        to: end,
        branch: requested.length > 0 ? branchesOf(flat, requested) : null,
        q: query.q,
        byName: query.q ? branchesByName(categories, query.q) : [],
      }),
    ]);

    const flow = computeFlow(movements.map(toAggregable));

    const parts = breakdown(movements, tree, requested.length === 1 ? requested[0] : undefined);
    const parentData =
      parts.parent === null ? undefined : tree.dataById.get(parts.parent.toString());
    const { granularity, points } = trend(movements, start, end);
    const { pending, budget } = await this.monthPending(userId, categories, tree);

    return {
      period: { from: toIsoDate(start), to: toIsoDate(end), granularity },
      accounts,
      totals: totalsOf(accounts),
      range: {
        income: serialize(flow.income),
        expense: serialize(flow.expense),
        net: serialize(flow.net),
        count: movements.length,
      },
      byCategory: parts.byCategory,
      expenseByCostCenter: parts.byCostCenter,
      breakdownLevel: breakdownLevelOf(parts.shownLevel),
      breakdownParent:
        parts.parent !== null && parentData ? { id: parts.parent, name: parentData.name } : null,
      requiredBudget: serialize(toMoney(budget)),
      pending,
      trend: points,
    };
  }

  /**
   * What is left to pay this month, and what the whole month needs.
   *
   * Of the CURRENT month, not of the range being looked at: the question
   * "what do I still have to pay?" is always about today, even while
   * reviewing 2024.
   */
  private async monthPending(
    userId: bigint,
    categories: readonly SummaryCategory[],
    tree: Tree,
  ): Promise<{ pending: PendingPayment[]; budget: Money }> {
    const currentMonth = `${new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().slice(0, 7)}-01`;
    const recurring = liveRecurring(categories);
    if (recurring.length === 0) return { pending: [], budget: ZERO };

    const ids = recurring.map((c) => c.id);
    // The history of the recurring concepts, month by month: this is where
    // what each one is expected to cost comes from. Only what is BEFORE this
    // month; this month's is a fact, not a forecast.
    const history = await this.ledger.monthlyHistory(userId, ids, historyWindow(currentMonth));
    /*
      What was already paid THIS month, and CLEARED.

      `status: 'cleared'` is not a detail: a `pending` movement is one not
      yet known to have happened —a scheduled transfer, an announced
      debit—. Taking the concept off the list for an uncleared payment is
      promising something is settled when it is not, and the month closes
      with an unpaid bill nobody looked at again.

      A pending payment is exactly that: something that is in the budget and
      does NOT yet have a cleared movement backing it.
    */
    const paidThisMonth = await this.ledger.clearedInMonth(userId, ids, new Date(currentMonth));

    return pendingThisMonth(recurring, { history, paidThisMonth }, currentMonth, tree);
  }
}

/**
 * The search also goes through the classification: "servicios públicos" brings
 * everything hanging from that category even if no row says it in its text.
 */
function branchesByName(categories: readonly SummaryCategory[], q: string): bigint[] {
  const needle = q.toLowerCase();
  const matches = categories.filter((c) => c.name.toLowerCase().includes(needle)).map((c) => c.id);
  const flat = categories.map((c) => ({ id: c.id, parentId: c.parentId }));
  return matches.length > 0 ? branchesOf(flat, matches) : [];
}

function toAggregable(m: SummaryMovement): AggregableMovement {
  return {
    type: m.type,
    amount: toMoney(m.amount),
    categoryId: m.categoryId,
    splits: m.splits.map((s) => ({ categoryId: s.categoryId, amount: toMoney(s.amount) })),
  };
}

/** The level the breakdown shows, from its depth (1 to 3). */
function breakdownLevelOf(depth: number): Dashboard['breakdownLevel'] {
  // `depth` goes from 1 to 3: the fallback is never used.
  const level = (['cost_center', 'category', 'concept'] as const)[depth - 1];
  return level ?? 'concept';
}
