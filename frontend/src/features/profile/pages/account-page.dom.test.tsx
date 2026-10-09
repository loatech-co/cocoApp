// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fakeNativeApp, leaveNativeApp } from '@/test-support/fake-app';

import { AccountPage } from './account-page';

const auth = {
  user: { email: 'g@coco.app', displayName: 'Gerardo' },
  isAdmin: false,
  signOut: vi.fn(() => Promise.resolve()),
  signOutEverywhere: vi.fn(() => Promise.resolve()),
  changePassword: vi.fn(() => Promise.resolve()),
};

vi.mock('@/shared/api/auth-context', () => ({
  useAuth: () => auth,
  authErrorMessage: () => '',
  errorDetails: () => [],
}));

// Los ajustes traen sus propias consultas; no son lo que se mira aquí.
vi.mock('@/features/profile/components/settings', () => ({ Settings: () => <p>ajustes</p> }));

function renderShell() {
  return render(
    <MemoryRouter initialEntries={['/mi-cuenta']}>
      <AccountPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  auth.isAdmin = false;
  auth.signOut.mockClear();
});

afterEach(() => {
  cleanup();
  leaveNativeApp();
});

describe('Mi cuenta dentro de la app', () => {
  beforeEach(() => fakeNativeApp());

  it('ofrece cerrar sesión en este dispositivo, y llama a salir()', () => {
    renderShell();

    const button = screen.getByRole('button', { name: 'Cerrar sesión' });
    fireEvent.click(button);
    expect(auth.signOut).toHaveBeenCalledTimes(1);

    // La de siempre sigue estando: son dos cosas distintas.
    expect(screen.getByRole('button', { name: 'Cerrar todo' })).toBeTruthy();
  });

  it('sin rol de administrador no hay bloque de administración', () => {
    renderShell();
    expect(screen.queryByRole('navigation', { name: 'Administración' })).toBeNull();
  });

  it('con rol de administrador, las secciones de administración como enlaces', () => {
    auth.isAdmin = true;
    renderShell();

    const block = screen.getByRole('navigation', { name: 'Administración' });
    const links = Array.from(block.querySelectorAll('a')).map((a) => [
      a.textContent,
      a.getAttribute('href'),
    ]);
    expect(links).toEqual([
      ['Usuarios', '/administracion'],
      ['Bitácora', '/administracion/bitacora'],
    ]);
  });
});

describe('Mi cuenta fuera de la app', () => {
  it('nada cambia: ni cerrar sesión aquí ni bloque de administración', () => {
    leaveNativeApp();
    auth.isAdmin = true;
    renderShell();

    expect(screen.queryByRole('button', { name: 'Cerrar sesión' })).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Administración' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Cerrar todo' })).toBeTruthy();
  });
});
