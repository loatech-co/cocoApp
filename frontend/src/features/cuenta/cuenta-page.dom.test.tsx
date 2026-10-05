// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fingirLaApp, salirDeLaApp } from '@/pruebas/app-falsa';

import { CuentaPage } from './cuenta-page';

const auth = {
  usuario: { email: 'g@coco.app', display_name: 'Gerardo' },
  esAdmin: false,
  salir: vi.fn(() => Promise.resolve()),
  salirDeTodosLosDispositivos: vi.fn(() => Promise.resolve()),
  cambiarContrasena: vi.fn(() => Promise.resolve()),
};

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => auth,
  mensajeDeErrorDeAuth: () => '',
  detallesDeError: () => [],
}));

// Los ajustes traen sus propias consultas; no son lo que se mira aquí.
vi.mock('./ajustes', () => ({ Ajustes: () => <p>ajustes</p> }));

function pintar() {
  return render(
    <MemoryRouter initialEntries={['/mi-cuenta']}>
      <CuentaPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  auth.esAdmin = false;
  auth.salir.mockClear();
});

afterEach(() => {
  cleanup();
  salirDeLaApp();
});

describe('Mi cuenta dentro de la app', () => {
  beforeEach(() => fingirLaApp());

  it('ofrece cerrar sesión en este dispositivo, y llama a salir()', () => {
    pintar();

    const boton = screen.getByRole('button', { name: 'Cerrar sesión' });
    fireEvent.click(boton);
    expect(auth.salir).toHaveBeenCalledTimes(1);

    // La de siempre sigue estando: son dos cosas distintas.
    expect(screen.getByRole('button', { name: 'Cerrar todo' })).toBeTruthy();
  });

  it('sin rol de administrador no hay bloque de administración', () => {
    pintar();
    expect(screen.queryByRole('navigation', { name: 'Administración' })).toBeNull();
  });

  it('con rol de administrador, las secciones de administración como enlaces', () => {
    auth.esAdmin = true;
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
    salirDeLaApp();
    auth.esAdmin = true;
    pintar();

    expect(screen.queryByRole('button', { name: 'Cerrar sesión' })).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Administración' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Cerrar todo' })).toBeTruthy();
  });
});
