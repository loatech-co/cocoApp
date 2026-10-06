// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FlagsProvider, useFlag } from './flags';

/**
 * The web reads flags only from `/auth/me`: no list, no flag; signing out
 * turns everything off again. `flags_canary` is the registry's canary.
 */
const sesion = vi.hoisted(() => ({ usuario: null as { id: number } | null }));
const authMe = vi.hoisted(() => vi.fn());

vi.mock('./auth-context', () => ({ useAuth: () => sesion }));
vi.mock('./generated/auth-v2/auth-v2', () => ({ authMe }));

afterEach(() => {
  cleanup();
  authMe.mockReset();
});

function Sonda() {
  return <p>{useFlag('flags_canary') ? 'encendida' : 'apagada'}</p>;
}

function montar() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const arbol = () => (
    <QueryClientProvider client={client}>
      <FlagsProvider>
        <Sonda />
      </FlagsProvider>
    </QueryClientProvider>
  );
  const vista = render(arbol());
  return { rerender: () => vista.rerender(arbol()) };
}

describe('FlagsProvider', () => {
  it('without a session every flag is off and /auth/me is not asked', () => {
    sesion.usuario = null;
    montar();
    expect(screen.getByText('apagada')).toBeTruthy();
    expect(authMe).not.toHaveBeenCalled();
  });

  it('turns on what /auth/me lists, and off again on signing out', async () => {
    sesion.usuario = { id: 1 };
    authMe.mockResolvedValue({ data: { features: ['flags_canary'] }, meta: {} });
    const { rerender } = montar();

    expect(await screen.findByText('encendida')).toBeTruthy();
    expect(authMe).toHaveBeenCalledOnce();

    sesion.usuario = null;
    rerender();
    expect(await screen.findByText('apagada')).toBeTruthy();
  });

  it('a response without the field (an older API) means no flags', async () => {
    sesion.usuario = { id: 2 };
    authMe.mockResolvedValue({ data: {}, meta: {} });
    montar();
    await vi.waitFor(() => expect(authMe).toHaveBeenCalled());
    expect(screen.getByText('apagada')).toBeTruthy();
  });
});
