// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fakeNativeApp, leaveNativeApp } from '@/test-support/fake-app';

import { CuentaPage } from './cuenta-page';

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
vi.mock('@/features/profile/components/ajustes', () => ({ Ajustes: () => <p>ajustes</p> }));

function pintar() {
  return render(
    <MemoryRouter initialEntries={['/mi-cuenta']}>
      <CuentaPage />
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
    pintar();

    const boton = screen.getByRole('button', { name: 'Cerrar sesión' });
    fireEvent.click(boton);
    expect(auth.signOut).toHaveBeenCalledTimes(1);

    // La de siempre sigue estando: son dos cosas distintas.
    expect(screen.getByRole('button', { name: 'Cerrar todo' })).toBeTruthy();
  });

  it('sin rol de administrador no hay bloque de administración', () => {
    pintar();
    expect(screen.queryByRole('navigation', { name: 'Administración' })).toBeNull();
  });

  it('con rol de administrador, las secciones de administración como enlaces', () => {
    auth.isAdmin = true;
    pintar();

    const bloque = screen.getByRole('navigation', { name: 'Administración' });
    const enlaces = Array.from(bloque.querySelectorAll('a')).map((a) => [
      a.textContent,
      a.getAttribute('href'),
    ]);
    expect(enlaces).toEqual([
      ['Usuarios', '/administracion'],
      ['Bitácora', '/administracion/bitacora'],
    ]);
  });
});

describe('Mi cuenta fuera de la app', () => {
  it('nada cambia: ni cerrar sesión aquí ni bloque de administración', () => {
    leaveNativeApp();
    auth.isAdmin = true;
    pintar();

    expect(screen.queryByRole('button', { name: 'Cerrar sesión' })).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Administración' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Cerrar todo' })).toBeTruthy();
  });
});
