// @vitest-environment jsdom
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useReceipts } from '@/features/transactions/api/receipts';
import { type Transaction } from '@/shared/api/generated/model';
import { TRANSACTION, TREE, atWidth, testQueryClient } from '@/test-support/transaction-sheet';

import { TransactionsTable } from './transactions-table';

vi.mock('@/features/transactions/api/receipts', () => ({ useReceipts: vi.fn() }));
vi.mock('@/features/transactions/hooks/use-receipt-files', () => ({
  useReceiptFiles: () => ({ list: [{ id: 1 }], urls: {}, failures: {}, retry: vi.fn() }),
}));
// The viewer itself has its own tests; here it only has to open.
vi.mock('./receipt-viewer', () => ({
  Lightbox: () => <div role="dialog" aria-label="Visor de soportes" />,
}));

/** Transaction 7 has one receipt; the rest have none. */
function receiptsOf(id: number | undefined) {
  return {
    isSuccess: true,
    data: id === 7 ? [{ id: 1 }] : [],
  } as unknown as ReturnType<typeof useReceipts>;
}

const SECOND = {
  ...TRANSACTION,
  id: 8,
  categoryId: null,
  description: 'Pago sin clasificar',
  notes: 'Una nota',
} as Transaction;

function renderTable(onOpen = vi.fn(), sort = vi.fn(), onEdit = vi.fn()) {
  render(
    <QueryClientProvider client={testQueryClient(TREE)}>
      <TransactionsTable
        transactions={[TRANSACTION, SECOND]}
        tree={TREE}
        onOpen={onOpen}
        onEdit={onEdit}
        sort={(field, first) => {
          sort(field, first);
          return { direction: null, onChange: () => sort(field) };
        }}
        phoneTotal={{ label: '2 movimientos', amount: '$ 240.000' }}
      />
    </QueryClientProvider>,
  );
  return { onOpen, sort, onEdit };
}

/** The toggles of the rows, in order. */
const rows = () => screen.getAllByRole('button', { expanded: false, name: /\$/ });

afterEach(() => {
  cleanup();
  atWidth(false);
});

describe('The transactions table, on the phone', () => {
  beforeEach(() => {
    atWidth(true);
    vi.mocked(useReceipts).mockImplementation(receiptsOf);
  });

  it('shows each row closed: only the name and the amount, and no table', () => {
    renderTable();

    expect(screen.queryByRole('table')).toBeNull();
    const [first] = rows();
    expect(first!.textContent).toMatch(/120\.000/);
    expect(first!.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('Periodo')).toBeNull();
    expect(screen.getByText('2 movimientos')).toBeDefined();
  });

  it('unfolds a row in place, read-only: the rest of its columns as text, no selectors', () => {
    renderTable();
    const [first] = rows();

    fireEvent.click(first!);
    expect(first!.getAttribute('aria-expanded')).toBe('true');
    const details = document.getElementById(first!.getAttribute('aria-controls')!)!;
    for (const label of ['Periodo', 'Fecha de pago', 'Clasificación']) {
      expect(within(details).getByText(label)).toBeDefined();
    }
    expect(within(details).queryByRole('combobox')).toBeNull();
    expect(within(details).queryByRole('button', { name: 'Ver movimiento' })).toBeNull();
  });

  it('«Editar» opens the transaction to edit it', () => {
    const { onEdit, onOpen } = renderTable();
    const [first] = rows();

    fireEvent.click(first!);
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    expect(onEdit).toHaveBeenCalledWith(TRANSACTION);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('«Ver soporte» opens the viewer when it has a receipt, and is absent when not', () => {
    renderTable();
    const [first, second] = rows();

    fireEvent.click(first!);
    fireEvent.click(screen.getByRole('button', { name: 'Ver soporte' }));
    expect(screen.getByRole('dialog', { name: 'Visor de soportes' })).toBeDefined();

    fireEvent.click(second!);
    expect(screen.queryByRole('button', { name: 'Ver soporte' })).toBeNull();
    expect(screen.getByText('Sin soporte')).toBeDefined();
  });

  it('keeps one row open at a time, and shows the notes when there are some', () => {
    renderTable();
    const [first, second] = rows();

    fireEvent.click(first!);
    fireEvent.click(second!);

    expect(first!.getAttribute('aria-expanded')).toBe('false');
    expect(second!.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Una nota')).toBeDefined();
  });

  it('sorts from the header by its two visible columns', () => {
    const { sort } = renderTable();

    fireEvent.click(screen.getByRole('button', { name: 'Valor' }));
    expect(sort).toHaveBeenCalledWith('amount');
    expect(screen.getByRole('button', { name: 'Concepto' })).toBeDefined();
  });
});
