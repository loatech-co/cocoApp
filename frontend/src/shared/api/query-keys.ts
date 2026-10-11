import { useQueryClient, type QueryClient } from '@tanstack/react-query';

/**
 * Cache keys.
 *
 * Since everything in Coco is DERIVED from the movements, creating or editing
 * one must also invalidate accounts and the dashboard: their figures just
 * changed even though nobody touched them directly. That is the counterpart
 * of not storing balances — there is nothing to sync, but there is something
 * to refresh.
 */
export const keys = {
  accounts: ['accounts'] as const,
  categories: ['categories'] as const,
  tags: ['tags'] as const,
  transactions: (filters?: object) => ['transactions', filters ?? {}] as const,
  dashboard: (filters?: object) => ['dashboard', filters ?? {}] as const,
  history: ['historia'] as const,
  receipts: (transactionId: number) => ['soportes', transactionId] as const,
};

/**
 * What changes when a movement changes: its lists, the accounts, the summary
 * and the history's ends (the first or last movement may be the one that moved).
 */
export function useInvalidateDerived() {
  const queryClient = useQueryClient();
  return () => invalidateDerived(queryClient);
}

/** The same, outside a hook: for the bridge, when the app says a capture synced. */
export function invalidateDerived(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ['transactions'] });
  void queryClient.invalidateQueries({ queryKey: keys.accounts });
  void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  void queryClient.invalidateQueries({ queryKey: keys.history });
}
