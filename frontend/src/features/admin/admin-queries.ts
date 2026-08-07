import type { AuditEntry, PaginationMeta, PerfilPublico, UserRole, UserStatus } from '@coco/types';
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api-client';

/**
 * Consultas del panel de administración.
 *
 * Separadas de `lib/queries.ts` a propósito: son de otro dominio y solo las
 * usa un rol. Mezclarlas obligaría a cargar el código de administración en el
 * paquete de cualquiera.
 */

export const adminKeys = {
  usuarios: (status?: UserStatus) => ['admin', 'users', status ?? 'todos'] as const,
  bitacora: (page: number) => ['admin', 'audit-log', page] as const,
};

export function useUsuarios(status?: UserStatus): UseQueryResult<{
  data: PerfilPublico[];
  meta: PaginationMeta;
}> {
  return useQuery({
    queryKey: adminKeys.usuarios(status),
    queryFn: async () => {
      const query = status ? `?status=${status}` : '';
      return apiFetch<PerfilPublico[], PaginationMeta>(`/admin/users${query}`);
    },
  });
}

export function useBitacora(page = 1): UseQueryResult<{
  data: AuditEntry[];
  meta: PaginationMeta;
}> {
  return useQuery({
    queryKey: adminKeys.bitacora(page),
    queryFn: async () => apiFetch<AuditEntry[], PaginationMeta>(`/admin/audit-log?page=${page}`),
  });
}

/**
 * Cualquier acción sobre un usuario invalida las listas Y la bitácora: la
 * acción acaba de generar un evento, y verlo aparecer es parte de confiar en
 * que quedó registrada.
 */
function useInvalidarAdmin() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['admin'] });
  };
}

type AccionSimple = 'approve' | 'suspend' | 'reactivate';

export function useAccionSobreUsuario() {
  const invalidar = useInvalidarAdmin();

  return useMutation({
    mutationFn: async ({ id, accion }: { id: number; accion: AccionSimple }) => {
      const respuesta = await apiFetch<PerfilPublico>(`/admin/users/${id}/${accion}`, {
        method: 'POST',
      });
      return respuesta.data;
    },
    onSuccess: invalidar,
  });
}

export function useCambiarRol() {
  const invalidar = useInvalidarAdmin();

  return useMutation({
    mutationFn: async ({ id, role }: { id: number; role: UserRole }) => {
      const respuesta = await apiFetch<PerfilPublico>(`/admin/users/${id}/role`, {
        method: 'POST',
        body: { role },
      });
      return respuesta.data;
    },
    onSuccess: invalidar,
  });
}

export function useRestablecerContrasena() {
  const invalidar = useInvalidarAdmin();

  return useMutation({
    mutationFn: async ({ id, newPassword }: { id: number; newPassword: string }) => {
      await apiFetch<void>(`/admin/users/${id}/reset-password`, {
        method: 'POST',
        body: { newPassword },
      });
    },
    onSuccess: invalidar,
  });
}
