import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';

import type { leerSoporte } from '@/features/transactions/api/leer-soporte';
import { MovimientoModal } from '@/features/transactions/components/movimiento-modal';
import { type CategoryTree } from '@/shared/api/categories';
import { type PendingPayment, type Transaction } from '@/shared/api/generated/model';
import { keys } from '@/shared/api/query-keys';

/*
  Lo que comparten las pruebas de la ficha de un movimiento: el árbol, el
  movimiento y los pagos de ejemplo, la lectura de mentira de un recibo y la
  forma de abrir la ficha con todo eso puesto.
*/

/** Un centro, una categoría y un concepto; `estatico` bloquea el centro entero. */
export const treeWith = (isStatic: boolean): CategoryTree[] =>
  [
    {
      id: 1,
      name: 'Costos fijos',
      kind: 'expense',
      isStatic: isStatic,
      children: [
        {
          id: 10,
          name: 'Servicios públicos',
          kind: 'expense',
          children: [{ id: 100, name: 'Celsia (Energía)', kind: 'expense', children: [] }],
        },
      ],
    },
  ] as unknown as CategoryTree[];

export const TREE = treeWith(false);

export const TRANSACTION: Transaction = {
  id: 7,
  description: 'Celsia septiembre',
  amount: '120000',
  date: '2026-09-04',
  period: '2026-09-01',
  type: 'expense',
  categoryId: 100,
  accountId: null,
  notes: null,
} as unknown as Transaction;

/** Un pago pendiente de Celsia, con su valor esperado y su vencimiento. */
export const PAYMENT: PendingPayment = {
  categoryId: 100,
  name: 'Celsia (Energía)',
  path: 'Costos fijos · Servicios públicos',
  periodicity: 'monthly',
  dueDate: '2026-10-05',
  expectedAmount: '180000',
} as unknown as PendingPayment;

/**
 * El mismo concepto, pero de los que se cubren a pedazos.
 *
 * El vencimiento va lejos de hoy A PROPÓSITO: si los dos cayeran en el mismo
 * día, la prueba de que la fecha es la de HOY pasaría igual estando mal.
 */
export const SPLIT_PAYMENT: PendingPayment = {
  categoryId: 100,
  name: 'Celsia (Energía)',
  path: 'Costos fijos · Servicios públicos',
  periodicity: 'monthly',
  dueDate: '2026-10-25',
  expectedAmount: '1200000',
  paidAmount: '320450',
  isMultiPayment: true,
} as unknown as PendingPayment;

/** Lo que el lector de mentira devuelve por un recibo de Celsia. */
export const CELSIA_READING: Awaited<ReturnType<typeof leerSoporte>> = {
  texto: 'CELSIA S.A. E.S.P. Total a pagar 214.500',
  fuente: 'texto-embebido',
  lectura: {
    concept: 'Celsia (Energía)',
    category: null,
    costCenter: null,
    value: 214500,
    date: '2026-10-02',
    confidence: 0.9,
    signals: { text: [], name: [], nit: [], ignoredCollectors: [] },
    reason: '',
    alternatives: [],
  },
};

/** Un cliente de consultas sin reintentos, con el árbol ya en la caché si se da. */
export function testQueryClient(tree?: CategoryTree[]): QueryClient {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  if (tree) client.setQueryData([...keys.categories, 'todas'], tree);
  return client;
}

/** La ficha abierta con esas props, dentro de su cliente y su router. */
export function renderSheet(
  props: Omit<ComponentProps<typeof MovimientoModal>, 'abierta' | 'onCerrar'>,
  client: QueryClient = testQueryClient(TREE),
) {
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <MovimientoModal abierta {...props} onCerrar={() => {}} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

export function openSheet(tree: CategoryTree[]) {
  return renderSheet({ movimiento: TRANSACTION }, testQueryClient(tree));
}

export function openConfirmation(payment: PendingPayment = PAYMENT) {
  return renderSheet({ movimiento: null, pago: payment });
}

export function openNew() {
  return renderSheet({ movimiento: null });
}

/**
 * Lo que jsdom no trae y la columna del soporte necesita.
 *
 * Urls de blobs —la columna hace una por archivo para previsualizarlo— y
 * `ResizeObserver`, que es con lo que el visor del soporte mide su marco para
 * encajar el documento dentro.
 */
export function fakeReceiptBrowser(): void {
  URL.createObjectURL = vi.fn(() => 'blob:prueba');
  URL.revokeObjectURL = vi.fn();
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
}
