import { useState } from 'react';

import { useDashboard, useTransactions } from '@/features/transactions/api/transactions';
import { toApiParams, reachesToday, useFilters } from '@/features/transactions/model/filters';
import type { SortOrder } from '@/features/transactions/model/sort-orders';
import { selectedPath } from '@/features/transactions/model/transactions';
import { useCategories } from '@/shared/api/categories';
import {
  type Category,
  type PendingPayment,
  type Transaction,
  type TransactionType,
} from '@/shared/api/generated/model';

/**
 * How many rows each page of the dashboard table brings.
 *
 * The table shows EVERYTHING that falls in the cut, paginated. Showing "just a
 * little" forces jumping to another screen to finish the question you were already
 * asking here.
 */
export const PAGE_SIZE = 25;

/** The page, the sort and the transactions of the dashboard table. */
function useDashboardTable(filters: ReturnType<typeof useFilters>['filters']) {
  // The same filters as the rest of the screen: if the list down here
  // did not respond to the cut, it would contradict the figures above.
  const [page, setPage] = useState(1);
  const [order, setOrder] = useState<SortOrder>('-date');
  const transactions = useTransactions({
    ...toApiParams(filters),
    page,
    perPage: PAGE_SIZE,
    sort: order,
  });

  /**
   * Connects a header with the sort.
   *
   * `first` is the direction of the FIRST click, and it is not the same for all: on
   * a date or an amount you want to see the biggest and the most recent
   * on top; on a name, the A.
   */
  const orderBy = (field: string, first: 'asc' | 'desc') => ({
    direction:
      order === field ? ('asc' as const) : order === `-${field}` ? ('desc' as const) : null,
    onChange: () => {
      setPage(1);
      const descending = `-${field}` as SortOrder;
      const ascending = field as SortOrder;
      if (order === ascending) setOrder(descending);
      else if (order === descending) setOrder(ascending);
      else setOrder(first === 'asc' ? ascending : descending);
    },
  });

  return { page, setPage, transactions, orderBy };
}

/** The transaction sheet opened from the dashboard, and what it opens with. */
function useDashboardSheet() {
  // The same modal as in Movimientos: editing from the dashboard cannot be
  // another screen or another form.
  const [editing, setEditing] = useState<Transaction | null | undefined>(undefined);
  /** The pending payment being confirmed. It changes the whole sheet. */
  const [confirming, setConfirming] = useState<PendingPayment | null>(null);
  const [newType, setNewType] = useState<TransactionType>('expense');

  return { editing, setEditing, confirming, setConfirming, newType, setNewType };
}

/** The path down to what is being broken down. */
function breakdownPath(tree: Category[], categoryIds: readonly number[]): Category[] {
  // Only with ONE category checked: with several there is no single "inside of" to
  // go back from.
  if (categoryIds.length !== 1) return [];
  const { costCenter, category, concept } = selectedPath(tree, categoryIds[0]);
  return [costCenter, category, concept].filter((n): n is Category => n !== undefined);
}

/** Everything the dashboard reads and remembers: filters, figures, table and sheet. */
export function useDashboardPage() {
  const { filters, apply, clear, hasActiveFilters } = useFilters();
  const dashboard = useDashboard(toApiParams(filters));
  const table = useDashboardTable(filters);
  const categories = useCategories();
  const tree = categories.data ?? [];
  const sheet = useDashboardSheet();

  /*
    ── What talks about the current month only shows up if the month is being viewed ──
    The necessary budget and the pending payments are NOT about the cut: they are
    always about today's month. Placed next to the figures of August 2024,
    they are not late —they answer another question—, and in a period already closed
    nothing is left pending, because it already happened.

    The test is whether the cut reaches today. That way the current month
    shows them, and so do the current year or the whole history —which contain it—,
    while any closed period hides them.
  */
  const isUpToDate = reachesToday(filters);

  /*
    The pending card only exists if there is something pending.

    Empty it does not say "all up to date": it says "there is a section here", and it takes a third
    of the row to say so. In a closed period nothing can be left
    pending —it already happened— and in the current month, with everything paid, the good news
    is that the card is not there.
  */
  const hasPending = isUpToDate && (dashboard.data?.pending.length ?? 0) > 0;

  const path = breakdownPath(tree, filters.categoryIds);

  return {
    filters,
    apply,
    clear,
    hasActiveFilters,
    dashboard,
    tree,
    isUpToDate,
    hasPending,
    table,
    sheet,
    path,
  };
}
