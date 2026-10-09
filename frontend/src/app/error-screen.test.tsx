// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { RouterProvider, createMemoryRouter, type RouteObject } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ErrorScreen, isStaleCode } from './error-screen';
import { routes } from './router';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderFailure(failure: () => never | Promise<never>) {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const router = createMemoryRouter([
    { errorElement: <ErrorScreen />, children: [{ path: '/', lazy: failure }] },
  ]);
  render(<RouterProvider router={router} />);
}

describe('the router error screen', () => {
  it('wraps every route of the app', () => {
    expect(routes).toHaveLength(1);
    expect(routes[0]?.errorElement).toBeTruthy();
    const caminos = (routes[0]?.children ?? []).map((r: RouteObject) => r.path);
    expect(caminos).toEqual(expect.arrayContaining(['/', '/sign-up', '*']));
  });

  it('says in Spanish that something broke, without the error itself', async () => {
    renderFailure(() => {
      throw new Error('detalle interno que no se enseña');
    });

    expect(await screen.findByRole('heading', { level: 1, name: 'Algo salió mal' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Recargar la página' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ir al inicio' })).toBeTruthy();
    expect(screen.queryByText(/detalle interno/)).toBeNull();
    expect(screen.queryByText(/Unexpected Application Error/)).toBeNull();
  });

  it('tells a chunk a deploy removed apart from any other failure', async () => {
    renderFailure(() =>
      Promise.reject(new TypeError('Failed to fetch dynamically imported module: /assets/a.js')),
    );

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Hay una versión nueva de Coco' }),
    ).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Ir al inicio' })).toBeNull();
  });

  it('recognises how each browser words a missing chunk', () => {
    expect(isStaleCode(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isStaleCode(new TypeError('error loading dynamically imported module'))).toBe(true);
    expect(isStaleCode(new Error('Cannot read properties of undefined'))).toBe(false);
    expect(isStaleCode('no es un error')).toBe(false);
  });
});
