import type {
  Account,
  ApiResponse,
  Category,
  Dashboard,
  PaginationMeta,
  Tag,
  Transaction,
} from '@coco/types';
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { apiFetch } from './api-client';

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
};

function useInvalidarDerivados() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['transactions'] });
    void queryClient.invalidateQueries({ queryKey: keys.accounts });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };
}

// ── Cuentas ──────────────────────────────────────────────────────────────────

export function useAccounts(incluirArchivadas = false): UseQueryResult<Account[]> {
  return useQuery({
    queryKey: [...keys.accounts, incluirArchivadas],
    queryFn: async () => {
      const query = incluirArchivadas ? '?include_archived=true' : '';
      const respuesta = await apiFetch<Account[]>(`/accounts${query}`);
      return respuesta.data;
    },
  });
}

export interface NuevaCuenta {
  name: string;
  type: Account['type'];
  institution?: string;
  last4?: string;
  credit_limit?: string;
  cutoff_day?: number;
  payment_day?: number;
  opening_balance?: string;
}

export function useCrearCuenta() {
  const queryClient = useQueryClient();
  const invalidarDerivados = useInvalidarDerivados();

  return useMutation({
    mutationFn: async (cuenta: NuevaCuenta) => {
      const respuesta = await apiFetch<Account>('/accounts', { method: 'POST', body: cuenta });
      return respuesta.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.accounts });
      invalidarDerivados();
    },
  });
}

export function useArchivarCuenta() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, archivar }: { id: number; archivar: boolean }) => {
      const respuesta = await apiFetch<Account>(`/accounts/${id}`, {
        method: 'PATCH',
        body: { is_archived: archivar },
      });
      return respuesta.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.accounts }),
  });
}

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

export function useSembrarDiccionario() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const respuesta = await apiFetch<{ creadas: number }>('/categories/seed', { method: 'POST' });
      return respuesta.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.categories }),
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

// ── Etiquetas ────────────────────────────────────────────────────────────────

export function useTags(): UseQueryResult<Tag[]> {
  return useQuery({
    queryKey: keys.tags,
    queryFn: async () => (await apiFetch<Tag[]>('/tags')).data,
  });
}

// ── Movimientos ──────────────────────────────────────────────────────────────

export interface FiltrosDeMovimientos {
  from?: string;
  to?: string;
  account_id?: number;
  category_id?: number;
  type?: Transaction['type'];
  status?: Transaction['status'];
  q?: string;
  page?: number;
  per_page?: number;
  sort?: string;
}

export function useTransactions(filtros: FiltrosDeMovimientos = {}) {
  return useQuery({
    queryKey: keys.transactions(filtros),
    queryFn: async (): Promise<ApiResponse<Transaction[], PaginationMeta>> => {
      const params = new URLSearchParams();
      for (const [clave, valor] of Object.entries(filtros)) {
        if (valor !== undefined && valor !== '') params.set(clave, String(valor));
      }
      const query = params.toString();
      return apiFetch<Transaction[], PaginationMeta>(
        `/transactions${query ? `?${query}` : ''}`,
      );
    },
  });
}

export interface NuevoMovimiento {
  /** Opcional: llevar cuentas es una función que se enciende en los ajustes. */
  account_id?: number;
  date: string;
  amount: string;
  type: Transaction['type'];
  category_id?: number;
  description?: string;
  merchant?: string;
  notes?: string;
  status?: Transaction['status'];
  tags?: string[];
}

export function useCrearMovimiento() {
  const invalidarDerivados = useInvalidarDerivados();

  return useMutation({
    mutationFn: async (movimiento: NuevoMovimiento) => {
      const respuesta = await apiFetch<Transaction>('/transactions', {
        method: 'POST',
        body: movimiento,
      });
      return respuesta.data;
    },
    onSuccess: invalidarDerivados,
  });
}

export function useEliminarMovimiento() {
  const invalidarDerivados = useInvalidarDerivados();

  return useMutation({
    mutationFn: async (id: number) => {
      await apiFetch<void>(`/transactions/${id}`, { method: 'DELETE' });
    },
    onSuccess: invalidarDerivados,
  });
}

export function useCrearTransferencia() {
  const invalidarDerivados = useInvalidarDerivados();

  return useMutation({
    mutationFn: async (transferencia: {
      from_account_id: number;
      to_account_id: number;
      date: string;
      amount: string;
      description?: string;
    }) => {
      const respuesta = await apiFetch<{ transfer_group_id: string; legs: Transaction[] }>(
        '/transactions/transfer',
        { method: 'POST', body: transferencia },
      );
      return respuesta.data;
    },
    onSuccess: invalidarDerivados,
  });
}

// ── Dashboard ────────────────────────────────────────────────────────────────

export interface FiltrosDeResumen {
  from?: string;
  to?: string;
  category_id?: number;
  q?: string;
}

export function useDashboard(filtros: FiltrosDeResumen = {}): UseQueryResult<Dashboard> {
  return useQuery({
    queryKey: keys.dashboard(filtros),
    queryFn: async () => {
      const params = new URLSearchParams();
      for (const [clave, valor] of Object.entries(filtros)) {
        if (valor !== undefined && valor !== '') params.set(clave, String(valor));
      }
      const query = params.toString();
      return (await apiFetch<Dashboard>(`/dashboard${query ? `?${query}` : ''}`)).data;
    },
    // Mantiene el gráfico anterior mientras llega el nuevo: sin esto, cada
    // cambio de filtro vacía la pantalla y la tendencia parpadea.
    placeholderData: (anterior) => anterior,
  });
}

// ── Edición ──────────────────────────────────────────────────────────────────

export function useActualizarMovimiento() {
  const invalidar = useInvalidarDerivados();

  return useMutation({
    mutationFn: async ({ id, cambios }: { id: number; cambios: Record<string, unknown> }) =>
      (await apiFetch<Transaction>(`/transactions/${id}`, { method: 'PATCH', body: cambios })).data,
    onSuccess: invalidar,
  });
}

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

export function useEliminarCategoria() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      await apiFetch(`/categories/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.categories });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
