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

// ── Movimientos ──────────────────────────────────────────────────────────────

export type TransactionFilters = TransactionsListParams;

export function useTransactions(
  filters: TransactionFilters = {},
  // `enabled` para quien monta la consulta antes de necesitarla: la ficha de
  // un movimiento está siempre montada y solo quiere los recientes al abrirse.
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    enabled: options.enabled ?? true,
    queryKey: keys.transactions(filters),
    queryFn: () => transactionsList(withoutEmpty(filters)),
  });
}

/**
 * Desde cuándo y hasta cuándo hay historia.
 *
 * Es lo que hace que "Todo" signifique algo: sin esto el rango arrancaba en
 * 1970 y el eje de la gráfica se estiraba sobre medio siglo vacío.
 *
 * `staleTime` alto a propósito: el primer movimiento de alguien no cambia
 * salvo que borre el más antiguo, y volver a preguntarlo en cada pantalla
 * sería una consulta por nada.
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
    // Mantiene el gráfico anterior mientras llega el nuevo: sin esto, cada
    // cambio de filtro vacía la pantalla y la tendencia parpadea.
    placeholderData: (previous) => previous,
  });
}

// ── Edición ──────────────────────────────────────────────────────────────────

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
