// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type CategoryTree } from '@/shared/api/categories';
import { keys } from '@/shared/api/query-keys';

import { TransactionModal } from './transaction-modal';

/*
  How many times a person has to touch the screen to note down an expense.

  Phase 2 sets it as a goal —five interactions or fewer with full
  classification, four or fewer when the suggestion is right— and until now the only
  number there was a count by hand in the log. This test COUNTS:
  each gesture of the person goes through `gesture()`, and what is asserted at the end is
  the total. If the sheet gains a step, the number goes up and the test says so; if
  it loses one, too, so it gets noted down.

  What does NOT count as an interaction: reading. Seeing that the suggestion is already
  set is not a gesture. And EVERYTHING is counted from when the sheet opens: the new
  sheet already opens in the form —the «cómo empezar» screen that was
  in front was removed—, so the first gesture is typing the amount.
*/

const red = vi.fn();
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
  return { ...real, apiRequest: (url: string, init?: RequestInit) => asPath(url, init) };
});

vi.mock('@/features/transactions/api/read-receipt', () => ({ readReceipt: vi.fn() }));

/*
  The history suggestion, faked and under each test's control.

  The real one waits 400 ms and asks the server; what is measured here is
  how many gestures it saves when it is RIGHT, not when it arrives. It always returns the
  same because, in a by-hand sheet, the description it depends on is not
  typed —the free-text field was swapped for the search—: it is the way to put a
  suggestion on top of the form without going through a receipt.
*/
const suggestion = vi.fn<
  () => { categoryId: number; confidence: number; reason: 'history' } | null
>(() => null);
vi.mock('@/features/transactions/hooks/use-category-suggestion', () => ({
  useCategorySuggestion: () => suggestion(),
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
        children: [
          {
            id: 100,
            name: 'Celsia (Energía)',
            kind: 'expense',
            keywords: ['celsia'],
            children: [],
          },
          { id: 101, name: 'Acueducto', kind: 'expense', children: [] },
        ],
      },
    ],
  },
] as unknown as CategoryTree[];

/** The counter. Every gesture of the person goes through here and through nowhere else. */
let interactions = 0;
function gesture(action: () => void): void {
  interactions += 1;
  action();
}

beforeEach(() => {
  interactions = 0;
  red.mockReset();
  suggestion.mockReturnValue(null);
  // The network answers by route: the sheet asks for the tree and the recent ones as soon as
  // it opens, and a single response would give it an `{ id }` where it expects lists.
  red.mockImplementation((path: string, options?: { method?: string }) => {
    if (options?.method === 'POST' && path === '/transactions')
      return Promise.resolve({ data: { id: 42 } });
    if (path.startsWith('/categories')) return Promise.resolve({ data: TREE });
    if (path.startsWith('/transactions')) return Promise.resolve({ data: [], meta: {} });
    return Promise.resolve({ data: null, meta: {} });
  });
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
});

afterEach(cleanup);

function openNewSheet(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  client.setQueryData([...keys.categories, 'all'], TREE);

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <TransactionModal isOpen transaction={null} onClose={() => {}} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const typeAmount = () =>
  gesture(() =>
    fireEvent.change(document.getElementById('tx-amount')!, { target: { value: '120000' } }),
  );

async function save(): Promise<void> {
  // The `async` with no `await` is on purpose: async `act` also flushes the
  // microtask queue, where the requests fired by the
  // submit resolve. With the synchronous version it would look at the network from before.
  // eslint-disable-next-line @typescript-eslint/require-await -- see above
  await act(async () => {
    gesture(() => fireEvent.submit(document.getElementById('tx-amount')!.closest('form')!));
  });
}

/** What was sent to be created, to check it went WITH a classification. */
const createdBody = () =>
  red.mock.calls.find(([path, o]) => path === '/transactions' && o?.method === 'POST')?.[1]
    ?.body as { categoryId: number | null; amount: unknown } | undefined;

const wasLearned = () => red.mock.calls.some(([path]) => path === '/categorization/learn');

describe('Recording an expense with full classification', () => {
  it('by hand, through the search: five gestures from when the sheet opens', async () => {
    openNewSheet();

    // The sheet opens in the form: there is nothing to press before typing.
    expect(screen.queryByText('Registrar manualmente')).toBeNull();

    typeAmount(); // 1

    // The search is a button that opens the search box: opening it is one
    // gesture, typing is another, picking the result is the third.
    gesture(() => fireEvent.click(screen.getByRole('button', { name: /Concepto/ }))); // 2
    gesture(() =>
      fireEvent.change(screen.getByLabelText('Buscar concepto o categoría'), {
        target: { value: 'celsia' },
      }),
    ); // 3
    gesture(() => fireEvent.click(screen.getByRole('option', { name: /^Celsia/ }))); // 4

    await save(); // 5

    expect(createdBody()).toMatchObject({ categoryId: 100 });
    // Nobody suggested anything: classifying by hand is not confirming a suggestion.
    expect(wasLearned()).toBe(false);

    /*
      The real number, counting EVERYTHING from when the sheet opens: amount,
      opening the search, typing, picking and saving. They are exactly the
      five the goal asks for (≤ 5); the sixth there used to be was the
      «cómo empezar» screen, and it is gone.
    */
    expect(interactions).toBe(5);
  });

  it('with a suggestion that is right: two gestures from when the sheet opens', async () => {
    suggestion.mockReturnValue({ categoryId: 100, confidence: 0.9, reason: 'history' });
    openNewSheet();

    typeAmount(); // 1

    // The suggestion is already set and says where it came from. Looking at it is not a
    // gesture: the rule of never saving a classification without the
    // person SEEING it is met by having it in front of them, not with one more click.
    expect(screen.getByRole('button', { name: /Concepto/ }).textContent).toContain(
      'Celsia (Energía)',
    );
    expect(screen.getByText(/Sugerido por tu historial/)).toBeDefined();

    await save(); // 2

    expect(createdBody()).toMatchObject({ categoryId: 100 });

    /*
      There was a suggestion, but there is nothing to learn from: the by-hand sheet has no
      description —the free-text field was swapped for the search— and a rule
      with no text is not a rule. `learn` is only called with a description, and
      that path —the one of a read receipt— is covered by the API e2e.
    */
    expect(wasLearned()).toBe(false);

    /*
      The real number, below the goal's ≤ 4: amount and save, and
      nothing else. Without the «cómo empezar» in front, the suggestion that is right leaves
      the sheet at two gestures.
    */
    expect(interactions).toBe(2);
  });
});
