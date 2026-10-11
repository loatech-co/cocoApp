import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';

import type { readReceipt } from '@/features/transactions/api/read-receipt';
import { TransactionModal } from '@/features/transactions/components/transaction-modal';
import { type CategoryTree } from '@/shared/api/categories';
import { type PendingPayment, type Transaction } from '@/shared/api/generated/model';
import { keys } from '@/shared/api/query-keys';

/*
  What the tests of a transaction's sheet share: the example tree, transaction and
  payments, the fake reading of a receipt, and the way to open the sheet with
  all of that in place.
*/

/** A center, a category and a concept; `isStatic` locks the whole center. */
export const treeWith = (isStatic: boolean): CategoryTree[] =>
  [
    {
      id: 1,
      name: 'Costos fijos',
      kind: 'expense',
      isStatic,
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

/** A pending Celsia payment, with its expected value and its due date. */
export const PAYMENT: PendingPayment = {
  categoryId: 100,
  name: 'Celsia (Energía)',
  path: 'Costos fijos · Servicios públicos',
  periodicity: 'monthly',
  dueDate: '2026-10-05',
  expectedAmount: '180000',
} as unknown as PendingPayment;

/**
 * The same concept, but one of those paid in pieces.
 *
 * The due date is far from today ON PURPOSE: if both fell on the same day,
 * the test that the date is TODAY's would pass even when it was wrong.
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

/** What the fake reader returns for a Celsia receipt. */
export const CELSIA_READING: Awaited<ReturnType<typeof readReceipt>> = {
  text: 'CELSIA S.A. E.S.P. Total a pagar 214.500',
  source: 'texto-embebido',
  reading: {
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

/** A query client without retries, with the tree already cached if given. */
export function testQueryClient(tree?: CategoryTree[]): QueryClient {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  if (tree) client.setQueryData([...keys.categories, 'all'], tree);
  return client;
}

/** The sheet open with those props, inside its client and its router. */
export function renderSheet(
  props: Omit<ComponentProps<typeof TransactionModal>, 'isOpen' | 'onClose'>,
  client: QueryClient = testQueryClient(TREE),
) {
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <TransactionModal isOpen {...props} onClose={() => {}} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

export function openSheet(tree: CategoryTree[]) {
  return renderSheet({ transaction: TRANSACTION }, testQueryClient(tree));
}

export function openConfirmation(payment: PendingPayment = PAYMENT) {
  return renderSheet({ transaction: null, payment });
}

export function openNew() {
  return renderSheet({ transaction: null });
}

/**
 * What jsdom does not ship and the receipt column needs.
 *
 * Blob URLs —the column makes one per file to preview it— and
 * `ResizeObserver`, which is what the receipt viewer measures its frame with
 * to fit the document inside.
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
