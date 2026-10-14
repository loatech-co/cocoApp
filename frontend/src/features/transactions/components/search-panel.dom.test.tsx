// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useTransactions } from '@/features/transactions/api/transactions';
import { type Transaction } from '@/shared/api/generated/model';
import { TRANSACTION, TREE } from '@/test-support/transaction-sheet';

import { SearchPanel } from './search-panel';

vi.mock('@/features/transactions/api/transactions', () => ({ useTransactions: vi.fn() }));
vi.mock('@/shared/api/categories', () => ({ useCategories: () => ({ data: TREE }) }));

const OTHER = { ...TRANSACTION, id: 8, description: 'Colegio', categoryId: null } as Transaction;

/** What the API answers: the latest without `q`, the matches with it. */
function answer(filters: { q?: string }) {
  const rows =
    filters.q === undefined
      ? [TRANSACTION, OTHER]
      : [TRANSACTION, OTHER].filter((m) =>
          (m.description ?? '').toLowerCase().includes(filters.q!.toLowerCase()),
        );
  return {
    isPending: false,
    isError: false,
    data: { data: rows, meta: { total: rows.length } },
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useTransactions>;
}

function open(onSelect = vi.fn()) {
  // Closed first and then opened, as the magnifier does: the sheet is always mounted.
  const { rerender } = render(<SearchPanel isOpen={false} onClose={vi.fn()} onSelect={onSelect} />);
  rerender(<SearchPanel isOpen onClose={vi.fn()} onSelect={onSelect} />);
  return onSelect;
}

async function type(text: string) {
  fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar un movimiento' }), {
    target: { value: text },
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(useTransactions).mockImplementation((filters = {}) => answer(filters));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.mocked(useTransactions).mockReset();
});

describe('The search sheet', () => {
  it('opens on the latest transactions, newest first, with the field focused', async () => {
    open();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(screen.getByText('Últimos movimientos')).toBeDefined();
    expect(vi.mocked(useTransactions)).toHaveBeenCalledWith({ perPage: 10, sort: '-date' });
    expect(screen.getByText('Colegio')).toBeDefined();
    expect(document.activeElement).toBe(screen.getByRole('searchbox'));
  });

  it('replaces them with the results of what is typed, and says how many', async () => {
    open();
    await type('cole');

    expect(vi.mocked(useTransactions)).toHaveBeenLastCalledWith({
      q: 'cole',
      perPage: 20,
      sort: '-date',
    });
    expect(screen.getByText('1 resultado')).toBeDefined();
    expect(screen.getByText('Colegio')).toBeDefined();
    expect(screen.queryByText('Últimos movimientos')).toBeNull();
  });

  it('says so when nothing matches', async () => {
    open();
    await type('zzz');

    expect(screen.getByText('Sin resultados para “zzz”')).toBeDefined();
  });

  it('brings the latest back when the field is emptied', async () => {
    open();
    await type('cole');
    await type('');

    expect(screen.getByText('Últimos movimientos')).toBeDefined();
  });

  it('opens the transaction that is tapped', () => {
    const onSelect = open();

    fireEvent.click(screen.getByText('Colegio'));
    expect(onSelect).toHaveBeenCalledWith(OTHER);
  });

  it('offers to retry when the search fails', () => {
    const refetch = vi.fn();
    vi.mocked(useTransactions).mockReturnValue({
      isPending: false,
      isError: true,
      refetch,
    } as unknown as ReturnType<typeof useTransactions>);
    open();

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(refetch).toHaveBeenCalled();
  });
});
