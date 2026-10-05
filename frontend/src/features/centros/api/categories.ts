import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  categoriesMerge,
  categoriesRemove,
  categoriesUpdate,
  categoriesUsage,
} from '@/shared/api/generated/categories-v2/categories-v2';
import type { UpdateCategoryInput } from '@/shared/api/generated/model';
import type { Cambios } from '@/shared/api/pages';
import { keys } from '@/shared/api/query-keys';

export function useActualizarCategoria() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, cambios }: { id: number; cambios: Cambios<UpdateCategoryInput> }) =>
      (await categoriesUpdate(id, cambios as UpdateCategoryInput)).data,
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
      (await categoriesMerge(origenId, { targetId: destinoId })).data,
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
    // `enabled` guarantees the id; the `?? 0` only satisfies the type.
    queryFn: async () => (await categoriesUsage(id ?? 0)).data,
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
      await categoriesRemove(id, reasignarA === undefined ? {} : { reassignTo: reasignarA });
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
