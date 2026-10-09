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

export function useAccounts(shouldIncludeArchived = false): UseQueryResult<Account[]> {
  return useQuery({
    queryKey: [...keys.accounts, shouldIncludeArchived],
    queryFn: () =>
      allPages(async (page) =>
        accountsList({ ...page, ...(shouldIncludeArchived ? { includeArchived: true } : {}) }),
      ),
  });
}

export type NewAccount = CreateAccountInput;

export function useCreateAccount() {
  const queryClient = useQueryClient();
  const invalidateDerived = useInvalidateDerived();

  return useMutation({
    mutationFn: async (account: NewAccount) => {
      return (await accountsCreate(account)).data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.accounts });
      invalidateDerived();
    },
  });
}

export function useArchiveAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, isArchived }: { id: number; isArchived: boolean }) => {
      return (await accountsUpdate(id, { isArchived })).data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.accounts }),
  });
}
