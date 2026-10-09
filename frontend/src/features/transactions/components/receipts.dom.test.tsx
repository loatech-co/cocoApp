// @vitest-environment jsdom
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { t } from '@/shared/lib/i18n';
import { testQueryClient } from '@/test-support/transaction-sheet';

import { Receipts } from './receipts';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const EMPTY_PAGE = { data: [], meta: { page: 1, perPage: 200, total: 0, totalPages: 0 } };

function renderReceipts() {
  return render(
    <QueryClientProvider client={testQueryClient()}>
      <Receipts transactionId={7} />
    </QueryClientProvider>,
  );
}

/**
 * A list that could not be requested is NOT a transaction without receipts.
 *
 * Shown as the empty drop zone, a 500 or a dropped network read as «this
 * payment has no paper», and the paper got uploaded twice.
 */
describe('The receipts of a transaction, when the list fails', () => {
  it('shows the error with a retry, never the empty drop zone', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(500, { title: 'Error', status: 500 }))
      .mockResolvedValue(json(200, EMPTY_PAGE));
    vi.stubGlobal('fetch', fetchMock);

    renderReceipts();

    expect((await screen.findByRole('alert')).textContent).toContain(
      t('transactions.supports.listFailed'),
    );
    expect(screen.queryByText(t('transactions.supports.dropTitle'))).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: t('transactions.supports.retry') }));

    expect(await screen.findByText(t('transactions.supports.dropTitle'))).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
