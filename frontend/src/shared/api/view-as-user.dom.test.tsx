// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AuthProvider, useAuth } from './auth-context';

/** An administrator's session, standing still: how it opens is not tested here. */
const STATE = {
  user: {
    id: 2,
    displayName: 'Gerardo',
    email: 'g@coco.app',
    role: 'admin',
    status: 'active',
  },
  isLoading: false,
};

vi.mock('./session', () => ({
  subscribe: () => () => {},
  currentState: () => STATE,
  restore: vi.fn(),
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  signOutEverywhere: vi.fn(),
  changePassword: vi.fn(),
}));

afterEach(cleanup);

function Probe() {
  const { isAdmin, isRealAdmin, isViewingAsUser, setViewAsUser } = useAuth();

  return (
    <>
      <p>
        {isAdmin ? 've el panel' : 'no ve el panel'} · {isRealAdmin ? 'es admin' : 'no es admin'}
      </p>
      <button type="button" onClick={() => setViewAsUser(!isViewingAsUser)}>
        alternar
      </button>
    </>
  );
}

function mount() {
  return render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
}

/**
 * Seeing the app the way someone who administers nothing sees it.
 *
 * It is a view, not a change of permissions: the token that travels is still
 * an administrator's and the API answers it as one. What changes is what this
 * screen offers — the rail, the My account badge, the two panel pages—, and
 * all of them decide it with `isAdmin`.
 */
describe('The user view', () => {
  it('turns the panel off without touching the role', () => {
    mount();
    expect(screen.getByText(/ve el panel · es admin/)).toBeDefined();

    fireEvent.click(screen.getByText('alternar'));

    // What the screen draws says no; the real role still says yes, and that
    // is the difference that holds everything else up.
    expect(screen.getByText(/no ve el panel · es admin/)).toBeDefined();
  });

  it('can be undone', () => {
    mount();
    fireEvent.click(screen.getByText('alternar'));
    fireEvent.click(screen.getByText('alternar'));

    expect(screen.getByText(/ve el panel · es admin/)).toBeDefined();
  });

  it('the switch stays available while it is on', () => {
    // Whoever shows it asks for `isRealAdmin`. With `isAdmin`, the switch
    // would disappear in the same click that turns it on, and the only way
    // out would be reloading without knowing why.
    mount();
    fireEvent.click(screen.getByText('alternar'));

    expect(screen.getByText(/es admin/)).toBeDefined();
    expect(screen.getByText('alternar')).toBeDefined();
  });

  it('does not survive a fresh start', () => {
    // It lives in memory and is forgotten on reload, on purpose: it is the
    // safety net of a mode that REMOVES things from the screen. It can never
    // stay on in a way nobody knows how to leave.
    mount();
    fireEvent.click(screen.getByText('alternar'));
    expect(screen.getByText(/no ve el panel/)).toBeDefined();

    cleanup();
    mount();

    expect(screen.getByText(/ve el panel · es admin/)).toBeDefined();
  });
});
