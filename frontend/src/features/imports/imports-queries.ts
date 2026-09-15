import type { ImportBatch, ImportRow, ImportRowStatus, ImportSource } from '@coco/types';
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api-client';
import { keys } from '@/lib/queries';

export const importKeys = {
  lotes: ['imports'] as const,
  lote: (id: number) => ['imports', id] as const,
};

/**
 * Confirmar o deshacer un lote cambia movimientos, y de ellos se derivan los
 * saldos y el resumen. Hay que invalidarlos aunque nadie los haya tocado
 * directamente — es la contraparte de no almacenar saldos.
 */
function useInvalidarTodo() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: importKeys.lotes });
    void queryClient.invalidateQueries({ queryKey: ['transactions'] });
    void queryClient.invalidateQueries({ queryKey: keys.accounts });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };
}

export function useLotes(): UseQueryResult<ImportBatch[]> {
  return useQuery({
    queryKey: importKeys.lotes,
    queryFn: async () => (await apiFetch<ImportBatch[]>('/imports')).data,
  });
}

export function useLote(id: number | null): UseQueryResult<ImportBatch> {
  return useQuery({
    queryKey: importKeys.lote(id ?? 0),
    enabled: id !== null,
    queryFn: async () => (await apiFetch<ImportBatch>(`/imports/${id!}`)).data,
  });
}

export interface FilaParaSubir {
  date: string;
  amount: string;
  type: 'expense' | 'income' | 'transfer';
  description?: string;
}

export function useCrearLote() {
  const invalidar = useInvalidarTodo();

  return useMutation({
    mutationFn: async (cuerpo: {
      /** Opcional: se puede importar sin declarar a qué cuenta pertenece. */
      account_id?: number;
      source: ImportSource;
      label?: string;
      ocr_provider?: string;
      rows: FilaParaSubir[];
    }) => (await apiFetch<ImportBatch>('/imports', { method: 'POST', body: cuerpo })).data,
    onSuccess: invalidar,
  });
}

export function useEditarFila(loteId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      rowId,
      cambios,
    }: {
      rowId: number;
      cambios: Partial<{
        date: string;
        amount: string;
        type: 'expense' | 'income' | 'transfer';
        description: string;
        category_id: number | null;
        status: ImportRowStatus;
      }>;
    }) =>
      (
        await apiFetch<ImportRow>(`/imports/${loteId}/rows/${rowId}`, {
          method: 'PATCH',
          body: cambios,
        })
      ).data,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: importKeys.lote(loteId) });
    },
  });
}

export function useConfirmarLote() {
  const invalidar = useInvalidarTodo();

  return useMutation({
    mutationFn: async (id: number) =>
      (
        await apiFetch<{ creados: number; lote: ImportBatch }>(`/imports/${id}/commit`, {
          method: 'POST',
        })
      ).data,
    onSuccess: invalidar,
  });
}

export function useDeshacerLote() {
  const invalidar = useInvalidarTodo();

  return useMutation({
    mutationFn: async (id: number) =>
      (await apiFetch<{ borrados: number }>(`/imports/${id}/undo`, { method: 'POST' })).data,
    onSuccess: invalidar,
  });
}

export function useDescartarLote() {
  const invalidar = useInvalidarTodo();

  return useMutation({
    mutationFn: async (id: number) => {
      await apiFetch<void>(`/imports/${id}`, { method: 'DELETE' });
    },
    onSuccess: invalidar,
  });
}
