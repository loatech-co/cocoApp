// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AuthProvider, useAuth } from './auth-context';

/** Una sesión de administrador, quieta: aquí no se prueba cómo se abre. */
const ESTADO = {
  usuario: {
    id: 2,
    display_name: 'Gerardo',
    email: 'g@coco.app',
    role: 'admin',
    status: 'active',
  },
  cargando: false,
};

vi.mock('./session', () => ({
  suscribirse: () => () => {},
  estadoActual: () => ESTADO,
  restaurar: vi.fn(),
  entrar: vi.fn(),
  registrarse: vi.fn(),
  salir: vi.fn(),
  salirDeTodosLosDispositivos: vi.fn(),
  cambiarContrasena: vi.fn(),
}));

afterEach(cleanup);

function Sonda() {
  const { esAdmin, esAdminDeVerdad, viendoComoUsuario, verComoUsuario } = useAuth();

  return (
    <>
      <p>
        {esAdmin ? 've el panel' : 'no ve el panel'} ·{' '}
        {esAdminDeVerdad ? 'es admin' : 'no es admin'}
      </p>
      <button type="button" onClick={() => verComoUsuario(!viendoComoUsuario)}>
        alternar
      </button>
    </>
  );
}

function montar() {
  return render(
    <AuthProvider>
      <Sonda />
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
    montar();
    expect(screen.getByText(/ve el panel · es admin/)).toBeDefined();

    fireEvent.click(screen.getByText('alternar'));

    // Lo que pinta la pantalla dice que no; el rol de verdad sigue diciendo
    // que sí, y esa es la diferencia que sostiene todo lo demás.
    expect(screen.getByText(/no ve el panel · es admin/)).toBeDefined();
  });

  it('se puede volver', () => {
    montar();
    fireEvent.click(screen.getByText('alternar'));
    fireEvent.click(screen.getByText('alternar'));

    expect(screen.getByText(/ve el panel · es admin/)).toBeDefined();
  });

  it('el interruptor sigue disponible mientras está encendida', () => {
    // Quien lo enseña pregunta por `esAdminDeVerdad`. Con `esAdmin`, el
    // interruptor desaparecería en el mismo clic que lo enciende, y la única
    // salida sería recargar sin saber por qué.
    montar();
    fireEvent.click(screen.getByText('alternar'));

    expect(screen.getByText(/es admin/)).toBeDefined();
    expect(screen.getByText('alternar')).toBeDefined();
  });

  it('no sobrevive a un arranque nuevo', () => {
    // Vive en memoria y se olvida al recargar, a propósito: es la red de
    // seguridad de un modo que QUITA cosas de la pantalla. Nunca se puede
    // quedar encendido de una forma de la que no se sepa salir.
    montar();
    fireEvent.click(screen.getByText('alternar'));
    expect(screen.getByText(/no ve el panel/)).toBeDefined();

    cleanup();
    montar();

    expect(screen.getByText(/ve el panel · es admin/)).toBeDefined();
  });
});
