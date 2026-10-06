import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import {
  accountsCreate,
  accountsList,
  accountsUpdate,
} from '@/shared/api/generated/accounts-v2/accounts-v2';
import type { Account, CreateAccountInput } from '@/shared/api/generated/model';
import { allPages } from '@/shared/api/pages';
import { keys, useInvalidateDerived } from '@/shared/api/query-keys';

// ── Cuentas ──────────────────────────────────────────────────────────────────

export function useAccounts(incluirArchivadas = false): UseQueryResult<Account[]> {
  return useQuery({
    queryKey: [...keys.accounts, incluirArchivadas],
    queryFn: () =>
      allPages(async (page) =>
        accountsList({ ...page, ...(incluirArchivadas ? { includeArchived: true } : {}) }),
      ),
  });
}

export type NuevaCuenta = CreateAccountInput;

export function useCrearCuenta() {
  const queryClient = useQueryClient();
  const invalidarDerivados = useInvalidateDerived();

  return useMutation({
    mutationFn: async (cuenta: NuevaCuenta) => {
      return (await accountsCreate(cuenta)).data;
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
      return (await accountsUpdate(id, { isArchived: archivar })).data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.accounts }),
  });
}
