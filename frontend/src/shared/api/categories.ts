import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import type { Category } from '@coco/types';

import { apiFetch } from './api-client';
import { keys } from './query-keys';

// ── Categorías ───────────────────────────────────────────────────────────────

export type CategoryTree = Category & { children?: CategoryTree[] };

export function useCategories(kind?: Category['kind']): UseQueryResult<CategoryTree[]> {
  return useQuery({
    queryKey: [...keys.categories, kind ?? 'todas'],
    queryFn: async () => {
      const query = kind ? `?kind=${kind}` : '';
      const respuesta = await apiFetch<CategoryTree[]>(`/categories${query}`);
      return respuesta.data;
    },
  });
}

export function useCrearCategoria() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (categoria: {
      name: string;
      kind: Category['kind'];
      parent_id?: number;
      color?: string;
      icon?: string;
      recurrente?: boolean;
      /** Solo en un centro de costos: bloquea reclasificarlo desde la tabla. */
      estatico?: boolean;
      periodicidad?: Category['periodicidad'];
      dia_de_pago?: number | null;
      mes_de_pago?: number | null;
      /** Solo en un concepto: lo que se busca en un soporte para reconocerlo. */
      palabras_clave?: string[];
    }) => {
      const respuesta = await apiFetch<Category>('/categories', {
        method: 'POST',
        body: categoria,
      });
      return respuesta.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.categories }),
  });
}
