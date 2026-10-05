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
import type { Cambios } from '@/shared/api/pages';
import { keys, useInvalidarDerivados } from '@/shared/api/query-keys';

// ── Movimientos ──────────────────────────────────────────────────────────────

export type FiltrosDeMovimientos = TransactionsListParams;

export function useTransactions(
  filtros: FiltrosDeMovimientos = {},
  // `enabled` para quien monta la consulta antes de necesitarla: la ficha de
  // un movimiento está siempre montada y solo quiere los recientes al abrirse.
  opciones: { enabled?: boolean } = {},
) {
  return useQuery({
    enabled: opciones.enabled ?? true,
    queryKey: keys.transactions(filtros),
    queryFn: () => transactionsList(sinVacios(filtros)),
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
export function useHistoria() {
  return useQuery({
    queryKey: keys.historia,
    queryFn: async (): Promise<TransactionHistory> => (await transactionsHistory()).data,
    staleTime: 5 * 60 * 1000,
  });
}

export type NuevoMovimiento = CreateTransactionInput;

export function useCrearMovimiento() {
  const invalidarDerivados = useInvalidarDerivados();

  return useMutation({
    mutationFn: async (movimiento: NuevoMovimiento) => {
      return (await transactionsCreate(movimiento)).data;
    },
    onSuccess: invalidarDerivados,
  });
}

export function useEliminarMovimiento() {
  const invalidarDerivados = useInvalidarDerivados();

  return useMutation({
    mutationFn: async (id: number) => {
      await transactionsRemove(id);
    },
    onSuccess: invalidarDerivados,
  });
}

// ── Dashboard ────────────────────────────────────────────────────────────────

export type FiltrosDeResumen = DashboardGetParams;

export function useDashboard(filtros: FiltrosDeResumen = {}): UseQueryResult<Dashboard> {
  return useQuery({
    queryKey: keys.dashboard(filtros),
    queryFn: async () => (await dashboardGet(sinVacios(filtros))).data,
    // Mantiene el gráfico anterior mientras llega el nuevo: sin esto, cada
    // cambio de filtro vacía la pantalla y la tendencia parpadea.
    placeholderData: (anterior) => anterior,
  });
}

// ── Edición ──────────────────────────────────────────────────────────────────

export function useActualizarMovimiento() {
  const invalidar = useInvalidarDerivados();

  return useMutation({
    mutationFn: async ({ id, cambios }: { id: number; cambios: Cambios<UpdateTransactionInput> }) =>
      (await transactionsUpdate(id, cambios as UpdateTransactionInput)).data,
    onSuccess: invalidar,
  });
}

/** A filter left empty —a cleared search box— is no filter: it does not travel. */
function sinVacios<T extends object>(filtros: T): T {
  return Object.fromEntries(
    Object.entries(filtros).filter(([, valor]) => valor !== undefined && valor !== ''),
  ) as T;
}
