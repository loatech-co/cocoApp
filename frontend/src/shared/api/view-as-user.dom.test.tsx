// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AuthProvider, useAuth } from './auth-context';

/** Una sesión de administrador, quieta: aquí no se prueba cómo se abre. */
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
 * Ver la aplicación como la ve quien no administra nada.
 *
 * Es una vista, no un cambio de permisos: el token que viaja sigue siendo el
 * de un administrador y la API le contesta como a tal. Lo que cambia es lo que
 * esta pantalla ofrece — el riel, la insignia de Mi cuenta, las dos páginas
 * del panel—, y todas esas lo deciden con `esAdmin`.
 */
describe('La vista de usuario', () => {
  it('apaga el panel sin tocar el rol', () => {
    mount();
    expect(screen.getByText(/ve el panel · es admin/)).toBeDefined();

    fireEvent.click(screen.getByText('alternar'));

    // Lo que pinta la pantalla dice que no; el rol de verdad sigue diciendo
    // que sí, y esa es la diferencia que sostiene todo lo demás.
    expect(screen.getByText(/no ve el panel · es admin/)).toBeDefined();
  });

  it('se puede volver', () => {
    mount();
    fireEvent.click(screen.getByText('alternar'));
    fireEvent.click(screen.getByText('alternar'));

    expect(screen.getByText(/ve el panel · es admin/)).toBeDefined();
  });

  it('el interruptor sigue disponible mientras está encendida', () => {
    // Quien lo enseña pregunta por `esAdminDeVerdad`. Con `esAdmin`, el
    // interruptor desaparecería en el mismo clic que lo enciende, y la única
    // salida sería recargar sin saber por qué.
    mount();
    fireEvent.click(screen.getByText('alternar'));

    expect(screen.getByText(/es admin/)).toBeDefined();
    expect(screen.getByText('alternar')).toBeDefined();
  });

  it('no sobrevive a un arranque nuevo', () => {
    // Vive en memoria y se olvida al recargar, a propósito: es la red de
    // seguridad de un modo que QUITA cosas de la pantalla. Nunca se puede
    // quedar encendido de una forma de la que no se sepa salir.
    mount();
    fireEvent.click(screen.getByText('alternar'));
    expect(screen.getByText(/no ve el panel/)).toBeDefined();

    cleanup();
    mount();

    expect(screen.getByText(/ve el panel · es admin/)).toBeDefined();
  });
});
