// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { LayoutDashboard, ScanLine, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PanelDeSecciones } from './panel-de-secciones';
import type { Seccion } from './navegacion';

// El panel lleva al pie el menú de la cuenta, que pregunta quién ha entrado.
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({
    usuario: { display_name: 'Gerardo', email: 'g@coco.app' },
    esAdmin: true,
    salir: vi.fn(),
  }),
}));

afterEach(cleanup);

const DIA_A_DIA: Seccion[] = [
  { to: '/', label: 'Resumen', Icono: LayoutDashboard, exact: true },
  { to: '/escanear', label: 'Escanear', Icono: ScanLine, exact: false },
];
const ADMIN: Seccion[] = [
  { to: '/administracion', label: 'Usuarios', Icono: ShieldCheck, exact: true },
];

function Anfitrion({ onCerrar }: { onCerrar?: () => void }) {
  const [abierta, setAbierta] = useState(false);
  return (
    <MemoryRouter>
      <button type="button" onClick={() => setAbierta(true)}>
        abrir
      </button>
      <PanelDeSecciones
        abierta={abierta}
        diaADia={DIA_A_DIA}
        administracion={ADMIN}
        onCerrar={() => {
          setAbierta(false);
          onCerrar?.();
        }}
      />
    </MemoryRouter>
  );
}

describe('El panel de secciones', () => {
  it('lleva TODO lo que el riel lleva en el escritorio', () => {
    render(<Anfitrion />);
    fireEvent.click(screen.getByText('abrir'));

    // Sin esto, en un teléfono no habría forma de llegar a la administración
    // ni de cerrar la sesión: no escondidas, inalcanzables.
    expect(screen.getByText('Resumen')).toBeTruthy();
    expect(screen.getByText('Escanear')).toBeTruthy();
    expect(screen.getByText('Usuarios')).toBeTruthy();
    expect(screen.getByText('Administración')).toBeTruthy();
    // El pie dice con qué cuenta se está dentro, y es el único sitio por el
    // que se sale. Su nombre accesible es el de la persona, no "Tu cuenta":
    // dos personas pueden llamarse igual y no tener el mismo correo.
    expect(screen.getByText('g@coco.app')).toBeTruthy();
  });

  it('cerrado no se ve, no se tabula y no desplaza la página', () => {
    const { container } = render(<Anfitrion />);
    const muelle = container.ownerDocument.querySelector('[data-superficie="secciones"]')!;

    // `visibility: hidden`, y no solo trasladado: un panel aparcado a 80vw
    // fuera de la pantalla es 80vw de desbordamiento en todas las páginas.
    expect(muelle.className).toContain('invisible');
    expect(muelle.getAttribute('data-abierta')).toBe('no');
    expect(screen.getByRole('dialog', { hidden: true }).hasAttribute('inert')).toBe(true);
  });

  it('la marca que lee el armazón cambia al abrir', () => {
    const { container } = render(<Anfitrion />);
    const muelle = container.ownerDocument.querySelector('[data-superficie="secciones"]')!;

    fireEvent.click(screen.getByText('abrir'));

    // De aquí salen, con `:has()`, el bloqueo del desplazamiento y la retirada
    // de las dos barras. Nunca de una clase que ponga un script.
    expect(muelle.getAttribute('data-abierta')).toBe('si');
  });

  it('tiene cuatro salidas, y ninguna es del anfitrión', () => {
    const cerrar = vi.fn();
    render(<Anfitrion onCerrar={cerrar} />);

    fireEvent.click(screen.getByText('abrir'));
    fireEvent.click(screen.getByLabelText('Cerrar el menú'));
    expect(cerrar).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('abrir'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(cerrar).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByText('abrir'));
    const muelle = document.querySelector('[data-superficie="secciones"]')!;
    fireEvent.mouseDown(muelle);
    expect(cerrar).toHaveBeenCalledTimes(3);
  });
});
