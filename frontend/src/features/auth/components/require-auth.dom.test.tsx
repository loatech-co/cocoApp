// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fakeNativeApp, leaveNativeApp } from '@/test-support/fake-app';

import { RequireAdmin, RequireAuth } from './require-auth';

const auth = { user: null as unknown, isLoading: false, isAdmin: false };

vi.mock('@/shared/api/auth-context', () => ({ useAuth: () => auth }));
vi.mock('@/features/auth/pages/login-page', () => ({
  LoginPage: () => <form aria-label="Entrar" />,
}));

function renderShell(guard: 'auth' | 'admin', route = '/') {
  const Guard = guard === 'auth' ? RequireAuth : RequireAdmin;
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Guard>
        <p>la página</p>
      </Guard>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  auth.user = null;
  auth.isLoading = false;
});

afterEach(() => {
  cleanup();
  leaveNativeApp();
});

describe('Sin sesión, embebida en la app', () => {
  it('no dibuja el formulario de entrar y avisa «sinSesion» una sola vez', () => {
    const { cocoEventos: events } = fakeNativeApp();
    const { rerender } = renderShell('auth');

    expect(screen.queryByRole('form', { name: 'Entrar' })).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('Abriendo tu sesión desde la app…');
    expect(events.postMessage).toHaveBeenCalledWith({ tipo: 'sinSesion' });

    // Un render más no es un aviso más: sería un sondeo a la app.
    rerender(
      <MemoryRouter initialEntries={['/']}>
        <RequireAuth>
          <p>la página otra vez</p>
        </RequireAuth>
      </MemoryRouter>,
    );
    expect(events.postMessage).toHaveBeenCalledTimes(1);
  });

  it('en otra ruta se queda donde está, sin volver al índice', () => {
    fakeNativeApp();
    renderShell('auth', '/centros-de-costos');

    // Si la app pidió una ruta, al llegar la sesión tiene que pintarse ESA.
    expect(screen.getByRole('status')).toBeTruthy();
    expect(screen.queryByRole('form', { name: 'Entrar' })).toBeNull();
  });

  it('la guardia de administración hace lo mismo', () => {
    const { cocoEventos: events } = fakeNativeApp();
    renderShell('admin', '/administracion');

    expect(screen.queryByRole('form', { name: 'Entrar' })).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('Abriendo tu sesión desde la app…');
    expect(events.postMessage).toHaveBeenCalledWith({ tipo: 'sinSesion' });
  });

  it('con sesión pinta la página', () => {
    fakeNativeApp();
    auth.user = { email: 'g@coco.app' };
    renderShell('auth');
    expect(screen.getByText('la página')).toBeTruthy();
  });
});

describe('Sin sesión, fuera de la app', () => {
  it('sigue dibujando el login en /', () => {
    leaveNativeApp();
    renderShell('auth');
    expect(screen.getByRole('form', { name: 'Entrar' })).toBeTruthy();
  });
});
