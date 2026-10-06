// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthProvider, useAuth } from './auth-context';
import { currentState } from './session';

/**
 * That the app RENDERS.
 *
 * This test exists because of a real failure that reached production: the app
 * served its HTML, its assets and its API without a single error, and the
 * browser showed an empty screen. Everything that had been checked —HTTP
 * codes, MIME types, headers— was fine; none of it runs React.
 *
 * The cause was `currentState()` returning a new object on every call.
 * `useSyncExternalStore` compares snapshots with `Object.is`, so a new object
 * always looks like a change: infinite loop, React unmounts the tree, blank
 * screen.
 */
describe('App startup', () => {
  beforeEach(() => {
    // The context calls /auth/refresh on mount. It is not what is tested
    // here, and without this jsdom would complain about a request with no server.
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          status: 401,
          ok: false,
          json: () =>
            Promise.resolve({
              type: 'https://dev-cocoapp.viteri.me/problems/unauthenticated',
              title: 'Hace falta iniciar sesión',
              status: 401,
              detail: 'x',
              code: 'unauthenticated',
            }),
        } as unknown as Response),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ── The rule the failure broke ──
  it('the session snapshot is STABLE between calls', () => {
    // It is the condition `useSyncExternalStore` requires and that, when
    // broken, leaves the screen empty without any error on the server.
    expect(currentState()).toBe(currentState());
  });

  it('AuthProvider mounts and renders its children', () => {
    render(
      <AuthProvider>
        <p>la app arrancó</p>
      </AuthProvider>,
    );

    expect(screen.getByText('la app arrancó')).toBeDefined();
  });

  it('exposes the initial state without a session', () => {
    function Probe() {
      const { user, isAdmin } = useAuth();
      return (
        <p>
          {user === null ? 'sin sesión' : 'con sesión'} · {isAdmin ? 'admin' : 'no admin'}
        </p>
      );
    }

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    expect(screen.getByText(/sin sesión · no admin/)).toBeDefined();
  });

  it('useAuth outside the provider fails with a useful message', () => {
    // Without this, the error would be "cannot read property of null"
    // somewhere far down the tree.
    function Unwrapped() {
      useAuth();
      return null;
    }

    const silence = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Unwrapped />)).toThrow(/inside <AuthProvider>/);
    silence.mockRestore();
  });
});
