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

describe('No session, embedded in the app', () => {
  it('does not draw the sign-in form and sends «noSession» only once', () => {
    const { cocoEvents: events } = fakeNativeApp();
    const { rerender } = renderShell('auth');

    expect(screen.queryByRole('form', { name: 'Entrar' })).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('Abriendo tu sesión desde la app…');
    expect(events.postMessage).toHaveBeenCalledWith({ type: 'noSession' });

    // One more render is not one more notice: it would be polling the app.
    rerender(
      <MemoryRouter initialEntries={['/']}>
        <RequireAuth>
          <p>la página otra vez</p>
        </RequireAuth>
      </MemoryRouter>,
    );
    expect(events.postMessage).toHaveBeenCalledTimes(1);
  });

  it('on another route it stays where it is, without going back to the index', () => {
    fakeNativeApp();
    renderShell('auth', '/cost-centers');

    // If the app asked for a route, when the session arrives THAT one must be drawn.
    expect(screen.getByRole('status')).toBeTruthy();
    expect(screen.queryByRole('form', { name: 'Entrar' })).toBeNull();
  });

  it('the admin guard does the same', () => {
    const { cocoEvents: events } = fakeNativeApp();
    renderShell('admin', '/admin');

    expect(screen.queryByRole('form', { name: 'Entrar' })).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('Abriendo tu sesión desde la app…');
    expect(events.postMessage).toHaveBeenCalledWith({ type: 'noSession' });
  });

  it('with a session it draws the page', () => {
    fakeNativeApp();
    auth.user = { email: 'g@coco.app' };
    renderShell('auth');
    expect(screen.getByText('la página')).toBeTruthy();
  });
});

describe('No session, outside the app', () => {
  it('keeps drawing the login at /', () => {
    leaveNativeApp();
    renderShell('auth');
    expect(screen.getByRole('form', { name: 'Entrar' })).toBeTruthy();
  });
});
