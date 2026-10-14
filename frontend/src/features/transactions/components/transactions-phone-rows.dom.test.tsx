// @vitest-environment jsdom
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type Transaction } from '@/shared/api/generated/model';
import { TRANSACTION, TREE, atWidth, testQueryClient } from '@/test-support/transaction-sheet';

import { TransactionsTable } from './transactions-table';

const SECOND = {
  ...TRANSACTION,
  id: 8,
  categoryId: null,
  description: 'Pago sin clasificar',
  notes: 'Una nota',
} as Transaction;

function renderTable(onOpen = vi.fn(), sort = vi.fn()) {
  render(
    <QueryClientProvider client={testQueryClient(TREE)}>
      <TransactionsTable
        transactions={[TRANSACTION, SECOND]}
        tree={TREE}
        onOpen={onOpen}
        sort={(field, first) => {
          sort(field, first);
          return { direction: null, onChange: () => sort(field) };
        }}
        phoneTotal={{ label: '2 movimientos', amount: '$ 240.000' }}
      />
    </QueryClientProvider>,
  );
  return { onOpen, sort };
}

/** The toggles of the rows, in order. */
const rows = () => screen.getAllByRole('button', { expanded: false, name: /\$/ });

afterEach(() => {
  cleanup();
  atWidth(false);
});

describe('The transactions table, on the phone', () => {
  beforeEach(() => atWidth(true));

  it('shows each row closed: only the name and the amount, and no table', () => {
    renderTable();

    expect(screen.queryByRole('table')).toBeNull();
    const [first] = rows();
    expect(first!.textContent).toMatch(/120\.000/);
    expect(first!.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('Periodo')).toBeNull();
    expect(screen.getByText('2 movimientos')).toBeDefined();
  });

  it('unfolds a row in place with the rest of its columns and the button that opens it', () => {
    const { onOpen } = renderTable();
    const [first] = rows();

    fireEvent.click(first!);
    expect(first!.getAttribute('aria-expanded')).toBe('true');
    const details = document.getElementById(first!.getAttribute('aria-controls')!)!;
    for (const label of ['Periodo', 'Fecha de pago', 'Centro de costos', 'Categoría']) {
      expect(within(details).getByText(label)).toBeDefined();
    }

    const open = within(details).getByRole('button', { name: 'Ver movimiento' });
    fireEvent.click(open);
    expect(onOpen).toHaveBeenCalledWith(TRANSACTION);
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
