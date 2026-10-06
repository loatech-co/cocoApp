// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthProvider, useAuth } from './auth-context';
import { estadoActual } from './session';

/**
 * Que la aplicación RENDERICE.
 *
 * Esta prueba existe por un fallo real que llegó a producción: la app servía
 * su HTML, sus assets y su API sin un solo error, y el navegador mostraba una
 * pantalla vacía. Todo lo que se había verificado —códigos HTTP, tipos MIME,
 * cabeceras— estaba bien; nada de eso ejecuta React.
 *
 * La causa era `estadoActual()` devolviendo un objeto nuevo en cada llamada.
 * `useSyncExternalStore` compara instantáneas con `Object.is`, así que un
 * objeto nuevo siempre parece un cambio: bucle infinito, React desmonta el
 * árbol, pantalla en blanco.
 */
describe('Arranque de la aplicación', () => {
  beforeEach(() => {
    // El contexto llama a /auth/refresh al montar. No es lo que se prueba
    // aquí, y sin esto jsdom se quejaría de una petición sin servidor.
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

  // ── La regla que el fallo violaba ──
  it('la instantánea de la sesión es ESTABLE entre llamadas', () => {
    // Es la condición que `useSyncExternalStore` exige y que, al romperse,
    // deja la pantalla vacía sin ningún error en el servidor.
    expect(estadoActual()).toBe(estadoActual());
  });

  it('AuthProvider monta y pinta a sus hijos', () => {
    render(
      <AuthProvider>
        <p>la app arrancó</p>
      </AuthProvider>,
    );

    expect(screen.getByText('la app arrancó')).toBeDefined();
  });

  it('expone el estado inicial sin sesión', () => {
    function Sonda() {
      const { usuario, esAdmin } = useAuth();
      return (
        <p>
          {usuario === null ? 'sin sesión' : 'con sesión'} · {esAdmin ? 'admin' : 'no admin'}
        </p>
      );
    }

    render(
      <AuthProvider>
        <Sonda />
      </AuthProvider>,
    );

    expect(screen.getByText(/sin sesión · no admin/)).toBeDefined();
  });

  it('useAuth fuera del proveedor falla con un mensaje útil', () => {
    // Sin esto, el error sería "cannot read property of null" en algún punto
    // lejano del árbol.
    function Suelto() {
      useAuth();
      return null;
    }

    const silencio = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Suelto />)).toThrow(/dentro de <AuthProvider>/);
    silencio.mockRestore();
  });
});
