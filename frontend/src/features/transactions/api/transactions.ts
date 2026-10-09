import { useMutation, useQuery, type UseQueryResult } from '@tanstack/react-query';

import { dashboardGet } from '@/shared/api/generated/dashboard-v2/dashboard-v2';
import type {
  CreateTransactionInput,
  Dashboard,
  DashboardGetParams,
  TransactionHistory,
  TransactionsListParams,
  UpdateTransactionInput,
} from '@/shared/api/generated/model';
import {
  transactionsCreate,
  transactionsHistory,
  transactionsList,
  transactionsRemove,
  transactionsUpdate,
} from '@/shared/api/generated/transactions-v2/transactions-v2';
import type { Changes } from '@/shared/api/pages';
import { keys, useInvalidateDerived } from '@/shared/api/query-keys';

// ── Transactions ─────────────────────────────────────────────────────────────

export type TransactionFilters = TransactionsListParams;

export function useTransactions(
  filters: TransactionFilters = {},
  // `enabled` for whoever mounts the query before needing it: the sheet of
  // a transaction is always mounted and only wants the recent ones when it opens.
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    enabled: options.enabled ?? true,
    queryKey: keys.transactions(filters),
    queryFn: () => transactionsList(withoutEmpty(filters)),
  });
}

/**
 * From when and until when there is history.
 *
 * It is what makes "Todo" mean something: without this the range started in
 * 1970 and the chart axis stretched over half an empty century.
 *
 * High `staleTime` on purpose: someone's first transaction does not change
 * unless they delete the oldest one, and asking for it again on every screen
 * would be a query for nothing.
 */
export function useHistory() {
  return useQuery({
    queryKey: keys.history,
    queryFn: async (): Promise<TransactionHistory> => (await transactionsHistory()).data,
    staleTime: 5 * 60 * 1000,
  });
}

export type NewTransaction = CreateTransactionInput;

export function useCreateTransaction() {
  const invalidateDerived = useInvalidateDerived();

  return useMutation({
    mutationFn: async (transaction: NewTransaction) => {
      return (await transactionsCreate(transaction)).data;
    },
    onSuccess: invalidateDerived,
  });
}

export function useDeleteTransaction() {
  const invalidateDerived = useInvalidateDerived();

  return useMutation({
    mutationFn: async (id: number) => {
      await transactionsRemove(id);
    },
    onSuccess: invalidateDerived,
  });
}

// ── Dashboard ────────────────────────────────────────────────────────────────

export type SummaryFilters = DashboardGetParams;

export function useDashboard(filters: SummaryFilters = {}): UseQueryResult<Dashboard> {
  return useQuery({
    queryKey: keys.dashboard(filters),
    queryFn: async () => (await dashboardGet(withoutEmpty(filters))).data,
    // Keeps the previous chart while the new one arrives: without this, every
    // filter change empties the screen and the trend flickers.
    placeholderData: (previous) => previous,
  });
}

// ── Editing ──────────────────────────────────────────────────────────────────

export function useUpdateTransaction() {
  const invalidate = useInvalidateDerived();

  return useMutation({
    mutationFn: async ({ id, changes }: { id: number; changes: Changes<UpdateTransactionInput> }) =>
      (await transactionsUpdate(id, changes as UpdateTransactionInput)).data,
    onSuccess: invalidate,
  });
}

/** A filter left empty —a cleared search box— is no filter: it does not travel. */
function withoutEmpty<T extends object>(filters: T): T {
  return Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== undefined && value !== ''),
  ) as T;
}
