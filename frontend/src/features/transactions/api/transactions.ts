import { useMutation, useQuery, type UseQueryResult } from '@tanstack/react-query';

import { apiFetch } from '@/shared/api/api-client';
import { keys, useInvalidarDerivados } from '@/shared/api/query-keys';
import type { ApiResponse, Dashboard, TransactionsMeta, Transaction } from '@coco/types';

// ── Movimientos ──────────────────────────────────────────────────────────────

export interface FiltrosDeMovimientos {
  from?: string;
  to?: string;
  account_id?: number;
  category_id?: number;
  type?: Transaction['type'];
  status?: Transaction['status'];
  q?: string;
  page?: number;
  per_page?: number;
  sort?: string;
}

export function useTransactions(
  filtros: FiltrosDeMovimientos = {},
  // `enabled` para quien monta la consulta antes de necesitarla: la ficha de
  // un movimiento está siempre montada y solo quiere los recientes al abrirse.
  opciones: { enabled?: boolean } = {},
) {
  return useQuery({
    enabled: opciones.enabled ?? true,
    queryKey: keys.transactions(filtros),
    queryFn: async (): Promise<ApiResponse<Transaction[], TransactionsMeta>> => {
      const params = new URLSearchParams();
      for (const [clave, valor] of Object.entries(filtros)) {
        if (valor !== undefined && valor !== '') params.set(clave, String(valor));
      }
      const query = params.toString();
      return apiFetch<Transaction[], TransactionsMeta>(`/transactions${query ? `?${query}` : ''}`);
    },
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
    queryFn: async (): Promise<{ first: string | null; last: string | null }> => {
      const { data } = await apiFetch<{ first: string | null; last: string | null }>(
        '/transactions/historia',
      );
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export interface NuevoMovimiento {
  /** Opcional: llevar cuentas es una función que se enciende en los ajustes. */
  account_id?: number;
  date: string;
  amount: string;
  type: Transaction['type'];
  category_id?: number;
  description?: string;
  merchant?: string;
  notes?: string;
  status?: Transaction['status'];
  tags?: string[];
}

export function useCrearMovimiento() {
  const invalidarDerivados = useInvalidarDerivados();

  return useMutation({
    mutationFn: async (movimiento: NuevoMovimiento) => {
      const respuesta = await apiFetch<Transaction>('/transactions', {
        method: 'POST',
        body: movimiento,
      });
      return respuesta.data;
    },
    onSuccess: invalidarDerivados,
  });
}

export function useEliminarMovimiento() {
  const invalidarDerivados = useInvalidarDerivados();

  return useMutation({
    mutationFn: async (id: number) => {
      await apiFetch<unknown>(`/transactions/${id}`, { method: 'DELETE' });
    },
    onSuccess: invalidarDerivados,
  });
}

// ── Dashboard ────────────────────────────────────────────────────────────────

export interface FiltrosDeResumen {
  from?: string;
  to?: string;
  category_id?: number;
  q?: string;
}

export function useDashboard(filtros: FiltrosDeResumen = {}): UseQueryResult<Dashboard> {
  return useQuery({
    queryKey: keys.dashboard(filtros),
    queryFn: async () => {
      const params = new URLSearchParams();
      for (const [clave, valor] of Object.entries(filtros)) {
        if (valor !== undefined && valor !== '') params.set(clave, String(valor));
      }
      const query = params.toString();
      return (await apiFetch<Dashboard>(`/dashboard${query ? `?${query}` : ''}`)).data;
    },
    // Mantiene el gráfico anterior mientras llega el nuevo: sin esto, cada
    // cambio de filtro vacía la pantalla y la tendencia parpadea.
    placeholderData: (anterior) => anterior,
  });
}

// ── Edición ──────────────────────────────────────────────────────────────────

export function useActualizarMovimiento() {
  const invalidar = useInvalidarDerivados();

  return useMutation({
    mutationFn: async ({ id, cambios }: { id: number; cambios: Record<string, unknown> }) =>
      (await apiFetch<Transaction>(`/transactions/${id}`, { method: 'PATCH', body: cambios })).data,
    onSuccess: invalidar,
  });
}
