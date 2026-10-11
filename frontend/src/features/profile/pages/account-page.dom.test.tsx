// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fakeNativeApp, leaveNativeApp } from '@/test-support/fake-app';

import { AccountPage } from './account-page';

const auth = {
  user: { email: 'g@coco.app', displayName: 'Ana' },
  isAdmin: false,
  signOut: vi.fn(() => Promise.resolve()),
  signOutEverywhere: vi.fn(() => Promise.resolve()),
  changePassword: vi.fn(() => Promise.resolve()),
};

vi.mock('@/shared/api/auth-context', () => ({
  useAuth: () => auth,
  authErrorMessage: (cause: unknown) => (cause instanceof Error ? cause.message : ''),
  errorDetails: () => [],
}));

// Settings bring their own queries; they are not what is checked here.
vi.mock('@/features/profile/components/settings', () => ({ Settings: () => <p>ajustes</p> }));

function WhereAmI() {
  const { pathname, hash } = useLocation();
  return <output>{`${pathname}${hash}`}</output>;
}

function renderShell(at = '/account') {
  return render(
    <MemoryRouter initialEntries={[at]}>
      <AccountPage />
      <WhereAmI />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  auth.isAdmin = false;
  auth.signOut.mockClear();
  auth.signOutEverywhere.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  leaveNativeApp();
});

describe('My account inside the app', () => {
  beforeEach(() => fakeNativeApp());

  it('offers signing out on this device, and calls salir()', () => {
    renderShell();

    const button = screen.getByRole('button', { name: 'Cerrar sesión' });
    fireEvent.click(button);
    expect(auth.signOut).toHaveBeenCalledTimes(1);

    // The usual one is still there: they are two different things.
    expect(screen.getByRole('button', { name: 'Cerrar todo' })).toBeTruthy();
  });

  it('without the admin role there is no admin block', () => {
    renderShell();
    expect(screen.queryByRole('navigation', { name: 'Administración' })).toBeNull();
  });

  it('with the admin role, the admin sections as links', () => {
    auth.isAdmin = true;
    renderShell();

    const block = screen.getByRole('navigation', { name: 'Administración' });
    const links = Array.from(block.querySelectorAll('a')).map((a) => [
      a.textContent,
      a.getAttribute('href'),
    ]);
    expect(links).toEqual([
      ['Usuarios', '/admin'],
      ['Bitácora', '/admin/audit-log'],
    ]);
  });
});

describe('My account outside the app', () => {
  it('nothing changes: no sign-out here and no admin block', () => {
    leaveNativeApp();
    auth.isAdmin = true;
    renderShell();

    expect(screen.queryByRole('button', { name: 'Cerrar sesión' })).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Administración' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Cerrar todo' })).toBeTruthy();
  });

  it('shows the failure when closing everywhere does not go through', async () => {
    leaveNativeApp();
    auth.signOutEverywhere.mockRejectedValue(new Error('no se pudo cerrar'));
    renderShell();

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar todo' }));

    expect(await screen.findByText('no se pudo cerrar')).toBeTruthy();
    expect(auth.signOutEverywhere).toHaveBeenCalledTimes(1);
  });
});

describe('the account anchors', () => {
  // jsdom does not lay out, so it has no scrolling to do.
  const scrollIntoView = vi.fn();
  beforeEach(() => {
    Element.prototype.scrollIntoView = scrollIntoView;
  });

  it.each([
    ['#ajustes', '#settings'],
    ['#seguridad', '#security'],
  ])('the old %s anchor is replaced by %s and scrolled to', async (old, current) => {
    renderShell(`/account${old}`);

    expect(await screen.findByText(`/account${current}`)).toBeTruthy();
    expect(document.getElementById(current.slice(1))).toBeTruthy();
    expect(scrollIntoView).toHaveBeenCalled();
  });
});
