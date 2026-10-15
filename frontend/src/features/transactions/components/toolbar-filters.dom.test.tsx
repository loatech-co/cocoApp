// @vitest-environment jsdom
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useTransactions } from '@/features/transactions/api/transactions';
import { type Filters } from '@/features/transactions/model/filters';
import { TRANSACTION, TREE, atWidth, testQueryClient } from '@/test-support/transaction-sheet';

import { ToolbarFilters } from './toolbar-filters';

vi.mock('@/features/transactions/api/transactions', async (original) => ({
  ...(await original()),
  useTransactions: vi.fn(),
}));

const FILTERS: Filters = {
  preset: 'this-month',
  from: '2026-10-01',
  to: '2026-10-14',
  categoryIds: [],
};

function renderBar(filters: Filters = FILTERS, onOpenTransaction = vi.fn()) {
  render(
    <QueryClientProvider client={testQueryClient(TREE)}>
      <MemoryRouter>
        <ToolbarFilters
          title="Resumen"
          filters={filters}
          apply={vi.fn()}
          clear={vi.fn()}
          hasActiveFilters={false}
          onOpenTransaction={onOpenTransaction}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return onOpenTransaction;
}

/** The open sheet: the always-mounted closed one is `inert`. */
const openSheet = () => document.querySelector<HTMLElement>('[role="dialog"][data-open="yes"]')!;

beforeEach(() => {
  atWidth(true);
  vi.useFakeTimers();
  vi.mocked(useTransactions).mockReturnValue({
    isPending: false,
    isError: false,
    data: { data: [TRANSACTION], meta: { total: 1 } },
  } as unknown as ReturnType<typeof useTransactions>);
});

afterEach(() => {
  cleanup();
  atWidth(false);
  vi.useRealTimers();
  vi.mocked(useTransactions).mockReset();
});

/**
 * The dashboard's magnifier, on the phone.
 *
 * The failure this guards against: it is a DIFFERENT sheet from the bottom
 * bar's search, and it opened with only a line of help —empty to the eye—
 * while the latest transactions showed only in the other one.
 */
describe("The dashboard's magnifier on the phone", () => {
  it('opens on the latest transactions, every time it opens', async () => {
    renderBar();
    const magnifier = screen.getByRole('button', { name: 'Buscar' });

    for (let i = 0; i < 2; i++) {
      fireEvent.click(magnifier);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(within(openSheet()).getByText('Últimos movimientos')).toBeDefined();
      expect(vi.mocked(useTransactions)).toHaveBeenLastCalledWith({ perPage: 10, sort: '-date' });
      fireEvent.keyDown(document, { key: 'Escape' });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });
    }
  });

  it('opens the transaction that is tapped', async () => {
    const onOpen = renderBar();
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    fireEvent.click(within(openSheet()).getByRole('button', { name: /120\.000/ }));
    expect(onOpen).toHaveBeenCalledWith(TRANSACTION);
  });
});
