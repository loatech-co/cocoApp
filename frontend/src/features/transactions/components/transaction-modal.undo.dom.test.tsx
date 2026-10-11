// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readReceipt } from '@/features/transactions/api/read-receipt';
import { type CategoryTree } from '@/shared/api/categories';
import { keys } from '@/shared/api/query-keys';

import { TransactionModal } from './transaction-modal';

/*
  The network, faked.

  `ApiClientError` is re-exported FOR REAL —not a copy— because the sheet
  decides which message to show with an `instanceof`: a parallel class with the
  same name would not match, and the test would take the wrong path
  without anyone noticing.
*/
const { ApiClientError } =
  await vi.importActual<typeof import('@/shared/api/api-client')>('@/shared/api/api-client');

const red = vi.fn();
const apiUpload = vi.fn();
/**
 * The generated client calls `apiRequest(url, init)` with the full v2 path and
 * a JSON string; the spy sees the route without `/api/v2` and the body as an
 * object, which is what these tests read.
 */
const asPath = (url: string, init?: RequestInit) =>
  red(url.replace(/^\/api\/v2/, ''), {
    method: init?.method ?? 'GET',
    ...(typeof init?.body === 'string' ? { body: JSON.parse(init.body) as unknown } : {}),
  });

vi.mock('@/shared/api/api-client', async () => {
  const real =
    await vi.importActual<typeof import('@/shared/api/api-client')>('@/shared/api/api-client');
  return {
    ...real,
    apiRequest: (url: string, init?: RequestInit) => asPath(url, init),
    apiUpload: (...args: unknown[]) => apiUpload(...args),
  };
});

vi.mock('@/features/transactions/api/read-receipt', () => ({ readReceipt: vi.fn() }));

/*
  The shrinking, stubbed along the way.

  The real one opens the image with the browser to find out its size, and jsdom
  does not draw: it would wait until its five-second clock ran out.
  What is tested here is what happens when the UPLOAD fails, not how the file is
  prepared —that has its own tests in `shared/lib/shrink-receipt.dom.test.ts`—.
*/
vi.mock('@/shared/lib/shrink-receipt', () => ({
  shrinkReceipts: (files: File[]) => Promise.resolve(files),
  shrinkReceipt: (file: File) => Promise.resolve(file),
}));

const TREE = [
  {
    id: 1,
    name: 'Costos fijos',
    kind: 'expense',
    isStatic: false,
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

/*
  What the fake reader returns: a file that opened and in which nothing
  was recognized.

  The first receipt of a new transaction is READ —since the sheet opens in
  the form there is no «Registrar manualmente» saying otherwise—, and
  what is tested here is what happens when the UPLOAD fails, not the reading.
  A reader that extracts nothing leaves the form as it was.
*/
const EMPTY_READING: Awaited<ReturnType<typeof readReceipt>> = {
  text: '',
  source: 'texto-embebido',
  reading: {
    concept: null,
    category: null,
    costCenter: null,
    value: null,
    date: null,
    confidence: 0,
    signals: { text: [], name: [], nit: [], ignoredCollectors: [] },
    reason: '',
    alternatives: [],
  },
};

beforeEach(() => {
  red.mockReset();
  apiUpload.mockReset();
  // The reading waits a four-second floor even if it is already done;
  // with the fake clock it is skipped over in `attach`.
  vi.useFakeTimers();
  vi.mocked(readReceipt).mockReset();
  vi.mocked(readReceipt).mockResolvedValue(EMPTY_READING);
  URL.createObjectURL = vi.fn(() => 'blob:prueba');
  URL.revokeObjectURL = vi.fn();
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function openNewSheet() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  client.setQueryData([...keys.categories, 'all'], TREE);

  const vista = render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <TransactionModal isOpen transaction={null} onClose={() => {}} />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  // The new sheet already opens in the form.
  return vista;
}

/** Attaches a file through the real input, which is hidden. */
async function attach(container: HTMLElement): Promise<void> {
  const field = container.querySelector('input[type="file"]')!;
  expect(field).not.toBeNull();

  const file = new File([new Uint8Array(64)], 'captura.png', { type: 'image/png' });
  Object.defineProperty(field, 'files', { value: [file], configurable: true });

  /*
    The `async` with no `await` inside is on purpose, and it is not interchangeable.

    `act` checks whether what it gets back is a thenable: with the synchronous version
    it flushes the effects and returns; with the async one it ALSO flushes the
    microtask queue, which is where the promises fired by the event resolve.
    This test depends on that —the file change kicks off the reading of the
    receipt, which is async— and with `act(() => …)` it looks at the DOM from before.
  */
  // eslint-disable-next-line @typescript-eslint/require-await -- see above
  await act(async () => {
    fireEvent.change(field);
  });

  // The floor of the reading wait: until it passes, the sheet shows the
  // document being read and not the form.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(4000);
  });
}

async function record(): Promise<void> {
  const value = document.getElementById('tx-amount') as HTMLInputElement;
  fireEvent.change(value, { target: { value: '120000' } });

  /*
    The `async` with no `await` inside is on purpose, and it is not interchangeable.

    `act` checks whether what it gets back is a thenable: with the synchronous version
    it flushes the effects and returns; with the async one it ALSO flushes the
    microtask queue, which is where the promises fired by the event resolve.
    This test depends on that —the file change kicks off the reading of the
    receipt, which is async— and with `act(() => …)` it looks at the DOM from before.
  */
  // eslint-disable-next-line @typescript-eslint/require-await -- see above
  await act(async () => {
    fireEvent.submit(value.closest('form')!);
  });
}

const calls = () => red.mock.calls.map(([path, options]) => [path, options?.method]);

/**
 * The network answers by ROUTE, not one thing for everything.
 *
 * The sheet queries the category tree as soon as it opens, and a single
 * response handed it a transaction's `{ id }` where it expected a list:
 * it blew up drawing the dropdowns, before reaching what is being tested.
 */
function respond({ onDelete }: { onDelete: () => Promise<unknown> }): void {
  red.mockImplementation((path: string, options?: { method?: string }) => {
    if (options?.method === 'DELETE') return onDelete();
    if (path.startsWith('/categories')) return Promise.resolve({ data: TREE });
    return Promise.resolve({ data: { id: 42 } });
  });
}

/**
 * A transaction is not saved without the receipt attached to it.
 *
 * Recording is TWO requests —the transaction and then its receipts— and the
 * second one can fail on its own. Before, the transaction stayed: there was money
 * noted down without the paper that explains it, and nothing on screen recalled
 * it was missing. Now it is undone.
 */
describe('When the receipt fails on record', () => {
  it('deletes the transaction that had just been created', async () => {
    respond({ onDelete: () => Promise.resolve({ data: undefined }) });
    apiUpload.mockRejectedValue(
      new ApiClientError(503, 'service_unavailable', 'Al servidor se le acabaron los recursos.'),
    );

    const { container } = openNewSheet();
    await attach(container);
    await record();

    // It was created, the receipt failed, and what was created is gone.
    expect(apiUpload).toHaveBeenCalledOnce();
    expect(calls()).toContainEqual(['/transactions/42', 'DELETE']);

    // And it is said plainly: nothing was left. Whoever reads anything else will be
    // looking in the table for a transaction that does not exist.
    expect(screen.getByText(/No quedó registrado nada/)).toBeDefined();
  });

  it('if it could not be undone either, it says so and does not duplicate on retry', async () => {
    respond({ onDelete: () => Promise.reject(new Error('sin conexión')) });
    apiUpload.mockRejectedValue(
      new ApiClientError(503, 'service_unavailable', 'Falló el soporte.'),
    );

    const { container } = openNewSheet();
    await attach(container);
    await record();

    expect(screen.getByText(/quedó registrado/)).toBeDefined();

    // The retry UPDATES 42 instead of creating a second transaction for
    // the same money: it is the case that required remembering the id.
    red.mockClear();
    await record();

    expect(calls()).toContainEqual(['/transactions/42', 'PATCH']);
    expect(calls().some(([path, method]) => path === '/transactions' && method === 'POST')).toBe(
      false,
    );
  });
});

/**
 * What the web saves now says where it came in from. A receipt's text only
 * travels when there was a reading; attaching by hand does not read —another test guards that—,
 * so here `rawText` goes empty on purpose.
 */
describe('What the web saves', () => {
  const creation = () =>
    red.mock.calls.find(
      ([path, options]) =>
        path === '/transactions' && (options as { method?: string } | undefined)?.method === 'POST',
    );

  it('sends source «web»; with no text read, rawText goes empty', async () => {
    respond({ onDelete: () => Promise.resolve({ data: undefined }) });
    apiUpload.mockResolvedValue({ data: [] });

    const { container } = openNewSheet();
    await attach(container);
    await record();

    expect(creation(), 'the transaction was created').toBeDefined();
    const body = (creation()![1] as { body: Record<string, unknown> }).body;
    expect(body.source).toBe('web');
    expect(body.rawText).toBeNull();
    // And the usual stuff still travels the same.
    expect(body.amount).toBe('120000');
    // The receipt was read —it is the first of a new transaction—, but it
    // extracted no text, and an empty text does not travel as an empty string: it travels as null.
    expect(vi.mocked(readReceipt)).toHaveBeenCalledOnce();
  });
});
