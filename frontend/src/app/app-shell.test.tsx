// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MOBILE_QUERY } from '@/shared/lib/mobile';
import { forgetShortcuts } from '@/shared/lib/shortcuts';
import { fakeNativeApp, leaveNativeApp } from '@/test-support/fake-app';

import { AppShell } from './app-shell';

vi.mock('@/shared/api/auth-context', () => ({
  useAuth: () => ({
    user: { displayName: 'Gerardo', email: 'g@coco.app' },
    esAdmin: false,
    signOut: vi.fn(),
  }),
}));

vi.mock('@/features/profile/api/preferences', () => ({ useHasAccounts: () => true }));

/** jsdom does not evaluate media queries: it is told the answer. */
function atWidth(isMobile: boolean): void {
  window.matchMedia = ((query: string) => ({
    matches: query === MOBILE_QUERY ? isMobile : !isMobile,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

/**
 * The (+) sheet queries the categories as soon as it opens, so the shell
 * needs a client. No network: what is checked is that the sheet IS there,
 * not what it brings inside.
 */
function renderShell() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, queryFn: () => Promise.resolve({ data: [] }) } },
  });

  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<AppShell />}>
            <Route index element={<p>la página</p>} />
            <Route path="cost-centers" element={<p>los centros</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(forgetShortcuts);
afterEach(() => {
  cleanup();
  leaveNativeApp();
});

describe('The shell below the breakpoint', () => {
  beforeEach(() => atWidth(true));

  it('the rail is not hidden: it is not there', () => {
    const { container } = renderShell();
    // Hidden with CSS it would still be nine links in the tab order and
    // every name twice on the page.
    expect(container.querySelector('aside')).toBeNull();
  });

  it('the top bar and the bar appear, and the body keeps its gap', () => {
    const { container } = renderShell();

    expect(container.querySelector('[data-armazon="techo"]')).toBeTruthy();
    expect(document.querySelector('[data-armazon="barra"]')).toBeTruthy();

    const body = container.querySelector('main')!;
    expect(body.className).toContain('movil:pb-[var(--hueco-de-la-barra)]');
    // Clips, does not offer: `auto` would turn the whole page into a
    // sideways scroll indistinguishable from the document's.
    expect(body.className).toContain('movil:overflow-x-clip');
  });

  it('the three sheets are mounted from the start, closed', () => {
    renderShell();

    // What slides cannot be rebuilt on every render: it would appear instead
    // of arriving. Shortcuts, search and the account.
    const sheets = document.querySelectorAll('[data-superficie="panel"]');
    expect(sheets.length).toBeGreaterThanOrEqual(3);
    for (const sheet of sheets) {
      expect(sheet.getAttribute('data-abierta')).toBe('no');
    }
  });

  it('the top bar carries the brand and nothing else: there is no hamburger', () => {
    const { container } = renderShell();
    const top = container.querySelector('[data-armazon="techo"]')!;

    // The full-screen menu was the fourth way to reach the same pages.
    // Everyday things are in the bar, any page in the shortcuts and admin
    // in the avatar sheet.
    expect(top.querySelector('[aria-label="Abrir el menú"]')).toBeNull();
    expect(top.querySelector('button')).toBeNull();
    expect(top.querySelector('svg')).toBeTruthy();
  });

  it('the bar (+) opens the sheet of a new transaction', async () => {
    renderShell();

    expect(document.querySelector('[aria-label="Nuevo movimiento"]')).toBeNull();
    act(() => {
      document.querySelector<HTMLElement>('[aria-label="Registrar un gasto"]')!.click();
    });
    // The sheet is its own chunk (`transaction-modal-on-demand.tsx`): it draws once it loads.
    await waitFor(() => {
      expect(document.querySelector('[aria-label="Nuevo movimiento"]')).toBeTruthy();
    });
  });
});

describe('The shell above the breakpoint', () => {
  beforeEach(() => atWidth(false));

  it('the rail comes back and nothing of the phone is there', () => {
    const { container } = renderShell();

    expect(container.querySelector('aside')).toBeTruthy();
    expect(container.querySelector('[data-armazon="techo"]')).toBeNull();
    expect(document.querySelector('[data-armazon="barra"]')).toBeNull();
    // And no sheet: on desktop the rail carries what they carry.
    expect(document.querySelector('[data-superficie="panel"]')).toBeNull();
  });
});

describe('The shell embedded in the app', () => {
  // The app runs on a phone almost always, but embedded mode does not
  // depend on the width: on a tablet there is no rail either.
  beforeEach(() => {
    atWidth(true);
    fakeNativeApp();
  });

  it('mounts no top bar, no bar, no shortcuts sheet and no account sheet', () => {
    const { container } = renderShell();

    // The native bar and the «Más» tab play that role. They are not hidden
    // with CSS: a hidden fixed bar still takes its place in the tab order.
    expect(container.querySelector('[data-armazon="techo"]')).toBeNull();
    expect(document.querySelector('[data-armazon="barra"]')).toBeNull();
    expect(document.querySelector('[aria-label="Registrar un gasto"]')).toBeNull();
    expect(document.body.textContent).not.toContain('Atajos');
    expect(container.querySelector('aside')).toBeNull();
  });

  it('it does mount the search, and window.__coco.openSearch() opens it', () => {
    renderShell();

    const sheets = document.querySelectorAll('[data-superficie="panel"]');
    // Only one: the search. Shortcuts and account are not there.
    expect(sheets.length).toBe(1);
    expect(sheets[0]!.getAttribute('data-abierta')).toBe('no');

    act(() => window.__coco!.openSearch());
    expect(sheets[0]!.getAttribute('data-abierta')).toBe('si');
  });

  it('window.__coco.navigate() changes the page without reloading', () => {
    const { container } = renderShell();
    expect(container.textContent).toContain('la página');

    act(() => window.__coco!.navigate('/cost-centers'));

    expect(container.textContent).toContain('los centros');
    expect(container.textContent).not.toContain('la página');
  });

  it('on a tablet there is no rail either', () => {
    atWidth(false);
    const { container } = renderShell();
    expect(container.querySelector('aside')).toBeNull();
    expect(window.__coco).toBeDefined();
  });
});

describe('Outside the app the bridge is not installed', () => {
  beforeEach(() => atWidth(true));

  it('window.__coco does not exist', () => {
    renderShell();
    expect(window.__coco).toBeUndefined();
  });
});
