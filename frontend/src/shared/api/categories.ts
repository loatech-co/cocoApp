import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import { categoriesCreate, categoriesList } from './generated/categories-v2/categories-v2';
import type { Category, CreateCategoryInput } from './generated/model';
import { allPages } from './pages';
import { keys } from './query-keys';

// ── Categorías ───────────────────────────────────────────────────────────────

/**
 * A node of the tree. The API sends `children` always (`CategoryNode`); it is
 * optional here so that a node built on the client —a test, an optimistic
 * insert— does not have to invent an empty list.
 */
export type CategoryTree = Category & { children?: CategoryTree[] };

export function useCategories(kind?: Category['kind']): UseQueryResult<CategoryTree[]> {
  return useQuery({
    queryKey: [...keys.categories, kind ?? 'todas'],
    queryFn: () => allPages(async (page) => categoriesList({ ...page, ...(kind ? { kind } : {}) })),
  });
}

export function useCreateCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (category: CreateCategoryInput) => (await categoriesCreate(category)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.categories }),
  });
}
