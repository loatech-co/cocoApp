import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import {
  adminApprove,
  adminAuditLog,
  adminChangeRole,
  adminListUsers,
  adminReactivate,
  adminResetPassword,
  adminSuspend,
} from '@/shared/api/generated/admin-v2/admin-v2';
import type {
  AuditEntry,
  PageMetaV2,
  Profile,
  ProfileRole,
  ProfileStatus,
} from '@/shared/api/generated/model';

/**
 * Consultas del panel de administración.
 *
 * Separadas de `lib/queries.ts` a propósito: son de otro dominio y solo las
 * usa un rol. Mezclarlas obligaría a cargar el código de administración en el
 * paquete de cualquiera.
 */

const adminKeys = {
  users: (status?: ProfileStatus) => ['admin', 'users', status ?? 'todos'] as const,
  auditLog: (page: number) => ['admin', 'audit-log', page] as const,
};

export function useUsers(status?: ProfileStatus): UseQueryResult<{
  data: Profile[];
  meta: PageMetaV2;
}> {
  return useQuery({
    queryKey: adminKeys.users(status),
    queryFn: () => adminListUsers(status ? { status } : {}),
  });
}

export function useAuditLog(page = 1): UseQueryResult<{
  data: AuditEntry[];
  meta: PageMetaV2;
}> {
  return useQuery({
    queryKey: adminKeys.auditLog(page),
    queryFn: () => adminAuditLog({ page }),
  });
}

/**
 * Cualquier acción sobre un usuario invalida las listas Y la bitácora: la
 * acción acaba de generar un evento, y verlo aparecer es parte de confiar en
 * que quedó registrada.
 */
function useInvalidateAdmin() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['admin'] });
  };
}

type SimpleAction = 'approve' | 'suspend' | 'reactivate';

export function useUserAction() {
  const invalidate = useInvalidateAdmin();

  return useMutation({
    mutationFn: async ({ id, action }: { id: number; action: SimpleAction }) => {
      const actionOf = {
        approve: adminApprove,
        suspend: adminSuspend,
        reactivate: adminReactivate,
      };
      return (await actionOf[action](id)).data;
    },
    onSuccess: invalidate,
  });
}

export function useChangeRole() {
  const invalidate = useInvalidateAdmin();

  return useMutation({
    mutationFn: async ({ id, role }: { id: number; role: ProfileRole }) => {
      return (await adminChangeRole(id, { role })).data;
    },
    onSuccess: invalidate,
  });
}

export function useResetPassword() {
  const invalidate = useInvalidateAdmin();

  return useMutation({
    mutationFn: async ({ id, newPassword }: { id: number; newPassword: string }) => {
      await adminResetPassword(id, { newPassword });
    },
    onSuccess: invalidate,
  });
}
