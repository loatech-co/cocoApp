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
 * Merges one concept into another: its transactions move to the target and it disappears.
 *
 * Invalidates EVERYTHING that depends on categories —the tree, the summary, the
 * transactions list— because after this there is not a single screen still
 * showing the same thing.
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
 * How much a deletion drags along, before doing it.
 *
 * It is requested when the confirmation OPENS and not before: it is one query per category,
 * and fetching it for the forty in the tree every time the screen opens would mean
 * paying for forty requests to get one that is almost never used.
 */
export function useCategoryUsage(id: number | undefined) {
  return useQuery({
    queryKey: ['categories', 'usages', id] as const,
    enabled: id !== undefined,
    // `enabled` guarantees the id; the `?? 0` only satisfies the type.
    queryFn: async () => (await categoriesUsage(id ?? 0)).data,
  });
}

export function useDeleteCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    /**
     * `reassignTo` is where its transactions go.
     *
     * Required if it has any —the API refuses without it— and that is why it is not
     * guessed here: the system does not know whether the misclassified rent
     * belongs to «Vivienda» or to «Oficina», and choosing on its own means
     * moving money to a place nobody asked for.
     */
    mutationFn: async ({ id, reassignTo }: { id: number; reassignTo?: number | undefined }) => {
      await categoriesRemove(id, reassignTo === undefined ? {} : { reassignTo });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.categories });
      // The transactions change category, so the table and the summary
      // stop being true: without this, a reassigned row keeps showing its
      // old category until someone reloads.
      void queryClient.invalidateQueries({ queryKey: ['transactions'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
