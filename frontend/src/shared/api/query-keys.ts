import { useQueryClient, type QueryClient } from '@tanstack/react-query';

/**
 * Claves de caché.
 *
 * Como todo en Coco se DERIVA de los movimientos, al crear o editar uno hay que
 * invalidar también cuentas y dashboard: sus cifras acaban de cambiar aunque
 * nadie las haya tocado directamente. Esa es la contraparte de no almacenar
 * saldos — no hay nada que sincronizar, pero sí que refrescar.
 */
export const keys = {
  accounts: ['accounts'] as const,
  categories: ['categories'] as const,
  tags: ['tags'] as const,
  transactions: (filtros?: object) => ['transactions', filtros ?? {}] as const,
  dashboard: (filtros?: object) => ['dashboard', filtros ?? {}] as const,
  historia: ['historia'] as const,
  soportes: (transactionId: number) => ['soportes', transactionId] as const,
};

/** Lo que cambia cuando cambia un movimiento: sus listas, las cuentas y el resumen. */
export function useInvalidarDerivados() {
  const queryClient = useQueryClient();
  return () => invalidateDerived(queryClient);
}

/** The same, outside a hook: for the bridge, when the app says a capture synced. */
export function invalidateDerived(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ['transactions'] });
  void queryClient.invalidateQueries({ queryKey: keys.accounts });
  void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
}
