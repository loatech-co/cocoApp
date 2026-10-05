import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/shared/api/api-client';
import { keys } from '@/shared/api/query-keys';
import type { Category } from '@coco/types';

export function useActualizarCategoria() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, cambios }: { id: number; cambios: Record<string, unknown> }) =>
      (await apiFetch<Category>(`/categories/${id}`, { method: 'PATCH', body: cambios })).data,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.categories });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

/**
 * Funde un concepto en otro: sus movimientos pasan al destino y él desaparece.
 *
 * Invalida TODO lo que dependa de categorías —el árbol, el resumen, la lista
 * de movimientos— porque después de esto no hay una sola pantalla que siga
 * mostrando lo mismo.
 */
export function useUnificarCategoria() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ origenId, destinoId }: { origenId: number; destinoId: number }) =>
      (
        await apiFetch<{ movidos: number; destino: Category }>(`/categories/${origenId}/unificar`, {
          method: 'POST',
          body: { destino_id: destinoId },
        })
      ).data,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.categories });
      void queryClient.invalidateQueries({ queryKey: ['transactions'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

/**
 * Cuánto arrastra un borrado, antes de hacerlo.
 *
 * Se pide al ABRIR la confirmación y no antes: es una consulta por categoría y
 * traerla para las cuarenta del árbol, cada vez que se abre la pantalla, sería
 * pagar cuarenta peticiones por una que casi nunca se usa.
 */
export function useUsosDeCategoria(id: number | undefined) {
  return useQuery({
    queryKey: ['categories', 'usos', id] as const,
    enabled: id !== undefined,
    queryFn: async () =>
      (await apiFetch<{ movimientos: number; subcategorias: number }>(`/categories/${id}/usos`))
        .data,
  });
}

export function useEliminarCategoria() {
  const queryClient = useQueryClient();

  return useMutation({
    /**
     * `reasignarA` es a dónde pasan sus movimientos.
     *
     * Obligatorio si tiene alguno —la API se niega sin él— y por eso no se
     * adivina aquí: el sistema no sabe si el alquiler mal clasificado
     * pertenece a «Vivienda» o a «Oficina», y elegir por su cuenta significa
     * mover plata a un sitio que nadie pidió.
     */
    mutationFn: async ({ id, reasignarA }: { id: number; reasignarA?: number | undefined }) => {
      const destino = reasignarA === undefined ? '' : `?reasignar_a=${reasignarA}`;
      await apiFetch(`/categories/${id}${destino}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.categories });
      // Los movimientos cambian de categoría, así que la tabla y el resumen
      // dejan de ser ciertos: sin esto, una fila reasignada sigue enseñando su
      // categoría vieja hasta que alguien recarga.
      void queryClient.invalidateQueries({ queryKey: ['transactions'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
