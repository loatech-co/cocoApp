import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  categoriesMerge,
  categoriesRemove,
  categoriesUpdate,
  categoriesUsage,
} from '@/shared/api/generated/categories-v2/categories-v2';
import type { UpdateCategoryInput } from '@/shared/api/generated/model';
import type { Changes } from '@/shared/api/pages';
import { keys } from '@/shared/api/query-keys';

export function useUpdateCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, changes }: { id: number; changes: Changes<UpdateCategoryInput> }) =>
      (await categoriesUpdate(id, changes as UpdateCategoryInput)).data,
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
export function useMergeCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sourceId, targetId }: { sourceId: number; targetId: number }) =>
      (await categoriesMerge(sourceId, { targetId })).data,
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
export function useCategoryUsage(id: number | undefined) {
  return useQuery({
    queryKey: ['categories', 'usos', id] as const,
    enabled: id !== undefined,
    // `enabled` guarantees the id; the `?? 0` only satisfies the type.
    queryFn: async () => (await categoriesUsage(id ?? 0)).data,
  });
}

export function useDeleteCategory() {
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
    mutationFn: async ({ id, reassignTo }: { id: number; reassignTo?: number | undefined }) => {
      await categoriesRemove(id, reassignTo === undefined ? {} : { reassignTo });
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
