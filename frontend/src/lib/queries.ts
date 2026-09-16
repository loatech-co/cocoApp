import type {
  Account,
  ApiResponse,
  Category,
  Dashboard,
  Soporte,
  TransactionsMeta,
  Tag,
  Transaction,
} from '@coco/types';
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { apiFetch, apiSubir } from './api-client';

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

/**
 * Los soportes de un movimiento: la FICHA de cada recibo, no el recibo.
 *
 * El binario se pide aparte y solo cuando alguien lo mira (`apiBlob`): traer
 * ocho PDFs de doscientos kilos cada vez que se abre un movimiento sería pagar
 * por adelantado por lo que casi nadie va a abrir.
 */
export function useSoportes(transactionId: number | undefined) {
  return useQuery({
    queryKey: keys.soportes(transactionId ?? 0),
    enabled: transactionId !== undefined,
    queryFn: async (): Promise<Soporte[]> =>
      (await apiFetch<Soporte[]>(`/transactions/${transactionId}/soportes`)).data,
  });
}

/** Sube soportes a un movimiento y devuelve la lista ya actualizada. */
export function useSubirSoportes(transactionId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      archivos,
      onProgreso,
    }: {
      archivos: File[];
      onProgreso?: (fraccion: number) => void;
    }): Promise<Soporte[]> => {
      const datos = new FormData();
      for (const archivo of archivos) datos.append('archivos', archivo);
      return apiSubir<Soporte[]>(`/transactions/${transactionId}/soportes`, datos, onProgreso);
    },
    // Se escribe la respuesta en la caché en vez de invalidarla: el servidor
    // acaba de devolver la lista entera y volver a pedirla es un viaje para
    // traer lo que ya está en la mano.
    onSuccess: (lista) => queryClient.setQueryData(keys.soportes(transactionId), lista),
  });
}

export function useEliminarSoporte(transactionId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (soporteId: number) => {
      await apiFetch<void>(`/transactions/${transactionId}/soportes/${soporteId}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: keys.soportes(transactionId) }),
  });
}

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
    queryFn: async (): Promise<ApiResponse<Transaction[], TransactionsMeta>> => {
      const params = new URLSearchParams();
      for (const [clave, valor] of Object.entries(filtros)) {
        if (valor !== undefined && valor !== '') params.set(clave, String(valor));
      }
      const query = params.toString();
      return apiFetch<Transaction[], TransactionsMeta>(
        `/transactions${query ? `?${query}` : ''}`,
      );
    },
  });
}

/**
 * Desde cuándo y hasta cuándo hay historia.
 *
 * Es lo que hace que "Todo" signifique algo: sin esto el rango arrancaba en
 * 1970 y el eje de la gráfica se estiraba sobre medio siglo vacío.
 *
 * `staleTime` alto a propósito: el primer movimiento de alguien no cambia
 * salvo que borre el más antiguo, y volver a preguntarlo en cada pantalla
 * sería una consulta por nada.
 */
export function useHistoria() {
  return useQuery({
    queryKey: keys.historia,
    queryFn: async (): Promise<{ first: string | null; last: string | null }> => {
      const { data } = await apiFetch<{ first: string | null; last: string | null }>(
        '/transactions/historia',
      );
      return data;
    },
    staleTime: 5 * 60 * 1000,
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
        await apiFetch<{ movidos: number; destino: Category }>(
          `/categories/${origenId}/unificar`,
          { method: 'POST', body: { destino_id: destinoId } },
        )
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
    mutationFn: async ({ id, reasignarA }: { id: number; reasignarA?: number }) => {
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
