// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FlagsProvider, useFlag } from './flags';

/**
 * The web reads flags only from `/auth/me`: no list, no flag; signing out
 * turns everything off again. `flags_canary` is the registry's canary.
 */
const session = vi.hoisted(() => ({ user: null as { id: number } | null }));
const authMe = vi.hoisted(() => vi.fn());

vi.mock('./auth-context', () => ({ useAuth: () => session }));
vi.mock('./generated/auth-v2/auth-v2', () => ({ authMe }));

afterEach(() => {
  cleanup();
  authMe.mockReset();
});

function Probe() {
  return <p>{useFlag('flags_canary') ? 'encendida' : 'apagada'}</p>;
}

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = () => (
    <QueryClientProvider client={client}>
      <FlagsProvider>
        <Probe />
      </FlagsProvider>
    </QueryClientProvider>
  );
  const vista = render(tree());
  return { rerender: () => vista.rerender(tree()) };
}

describe('FlagsProvider', () => {
  it('without a session every flag is off and /auth/me is not asked', () => {
    session.user = null;
    mount();
    expect(screen.getByText('apagada')).toBeTruthy();
    expect(authMe).not.toHaveBeenCalled();
  });

  it('turns on what /auth/me lists, and off again on signing out', async () => {
    session.user = { id: 1 };
    authMe.mockResolvedValue({ data: { features: ['flags_canary'] }, meta: {} });
    const { rerender } = mount();

    expect(await screen.findByText('encendida')).toBeTruthy();
    expect(authMe).toHaveBeenCalledOnce();

    session.user = null;
    rerender();
    expect(await screen.findByText('apagada')).toBeTruthy();
  });

  it('keeps OpenFeature out of the initial bundle: only flags-engine imports it', () => {
    const sources = import.meta.glob<string>('/src/**/*.{ts,tsx}', {
      query: '?raw',
      import: 'default',
      eager: true,
    });
    const withOpenFeature = Object.entries(sources)
      .filter(([path, code]) => !path.includes('.test.') && code.includes('@openfeature/'))
      .map(([path]) => path);
    expect(withOpenFeature).toEqual(['/src/shared/api/flags-engine.ts']);

    const importers = Object.entries(sources)
      .filter(([path, code]) => !path.includes('.test.') && /from '[^']*flags-engine'/.test(code))
      .filter(([, code]) => !/import type \* as \w+ from '\.\/flags-engine'/.test(code));
    expect(importers.map(([path]) => path)).toEqual([]);
  });

  it('a response without the field (an older API) means no flags', async () => {
    session.user = { id: 2 };
    authMe.mockResolvedValue({ data: {}, meta: {} });
    mount();
    await vi.waitFor(() => expect(authMe).toHaveBeenCalled());
    expect(screen.getByText('apagada')).toBeTruthy();
  });
});
