import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import { apiFetch } from '@/shared/api/api-client';
import { keys, useInvalidarDerivados } from '@/shared/api/query-keys';
import type { Account } from '@coco/types';

// ── Cuentas ──────────────────────────────────────────────────────────────────

export function useAccounts(incluirArchivadas = false): UseQueryResult<Account[]> {
  return useQuery({
    queryKey: [...keys.accounts, incluirArchivadas],
    queryFn: async () => {
      const query = incluirArchivadas ? '?include_archived=true' : '';
      const respuesta = await apiFetch<Account[]>(`/accounts${query}`);
      return respuesta.data;
    },
  });
}

export interface NuevaCuenta {
  name: string;
  type: Account['type'];
  institution?: string;
  last4?: string;
  credit_limit?: string;
  cutoff_day?: number;
  payment_day?: number;
  opening_balance?: string;
}

export function useCrearCuenta() {
  const queryClient = useQueryClient();
  const invalidarDerivados = useInvalidarDerivados();

  return useMutation({
    mutationFn: async (cuenta: NuevaCuenta) => {
      const respuesta = await apiFetch<Account>('/accounts', { method: 'POST', body: cuenta });
      return respuesta.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.accounts });
      invalidarDerivados();
    },
  });
}

export function useArchivarCuenta() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, archivar }: { id: number; archivar: boolean }) => {
      const respuesta = await apiFetch<Account>(`/accounts/${id}`, {
        method: 'PATCH',
        body: { is_archived: archivar },
      });
      return respuesta.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.accounts }),
  });
}
