// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fingirLaApp, salirDeLaApp } from '@/pruebas/app-falsa';

import { RequireAdmin, RequireAuth } from './require-auth';

const auth = { usuario: null as unknown, cargando: false, esAdmin: false };

vi.mock('@/shared/api/auth-context', () => ({ useAuth: () => auth }));
vi.mock('@/features/auth/pages/login-page', () => ({
  LoginPage: () => <form aria-label="Entrar" />,
}));

function pintar(guardia: 'auth' | 'admin', ruta = '/') {
  const Guardia = guardia === 'auth' ? RequireAuth : RequireAdmin;
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <Guardia>
        <p>la página</p>
      </Guardia>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  auth.usuario = null;
  auth.cargando = false;
});

afterEach(() => {
  cleanup();
  salirDeLaApp();
});

describe('Sin sesión, embebida en la app', () => {
  it('no dibuja el formulario de entrar y avisa «sinSesion» una sola vez', () => {
    const { cocoEventos } = fingirLaApp();
    const { rerender } = pintar('auth');

    expect(screen.queryByRole('form', { name: 'Entrar' })).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('Abriendo tu sesión desde la app…');
    expect(cocoEventos.postMessage).toHaveBeenCalledWith({ tipo: 'sinSesion' });

    // Un render más no es un aviso más: sería un sondeo a la app.
    rerender(
      <MemoryRouter initialEntries={['/']}>
        <RequireAuth>
          <p>la página otra vez</p>
        </RequireAuth>
      </MemoryRouter>,
    );
    expect(cocoEventos.postMessage).toHaveBeenCalledTimes(1);
  });

  it('en otra ruta se queda donde está, sin volver al índice', () => {
    fingirLaApp();
    pintar('auth', '/centros-de-costos');

    // Si la app pidió una ruta, al llegar la sesión tiene que pintarse ESA.
    expect(screen.getByRole('status')).toBeTruthy();
    expect(screen.queryByRole('form', { name: 'Entrar' })).toBeNull();
  });

  it('la guardia de administración hace lo mismo', () => {
    const { cocoEventos } = fingirLaApp();
    pintar('admin', '/administracion');

    expect(screen.queryByRole('form', { name: 'Entrar' })).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('Abriendo tu sesión desde la app…');
    expect(cocoEventos.postMessage).toHaveBeenCalledWith({ tipo: 'sinSesion' });
  });

  it('con sesión pinta la página', () => {
    fingirLaApp();
    auth.usuario = { email: 'g@coco.app' };
    pintar('auth');
    expect(screen.getByText('la página')).toBeTruthy();
  });
});

describe('Sin sesión, fuera de la app', () => {
  it('sigue dibujando el login en /', () => {
    salirDeLaApp();
    pintar('auth');
    expect(screen.getByRole('form', { name: 'Entrar' })).toBeTruthy();
  });
});
