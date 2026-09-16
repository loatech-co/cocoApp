// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PanelInferior } from './panel-inferior';

afterEach(cleanup);

function Anfitrion({ onCerrar }: { onCerrar?: () => void }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setAbierto(true)}>
        abrir
      </button>
      <PanelInferior
        abierto={abierto}
        titulo="Atajos"
        onCerrar={() => {
          setAbierto(false);
          onCerrar?.();
        }}
      >
        <p>lo de dentro</p>
      </PanelInferior>
    </>
  );
}

describe('El panel inferior', () => {
  it('está montado antes de abrirse: lo que se desliza no se reconstruye', () => {
    render(<Anfitrion />);
    const panel = screen.getByRole('dialog', { hidden: true });

    expect(panel.dataset.abierta).toBe('no');

    // El MISMO nodo después de abrir. Uno reconstruido no tendría posición
    // anterior desde la que viajar: aparecería, nunca llegaría.
    fireEvent.click(screen.getByText('abrir'));
    expect(screen.getByRole('dialog').isSameNode(panel)).toBe(true);
    expect(panel.dataset.abierta).toBe('si');
  });

  it('cerrado no se tabula', () => {
    render(<Anfitrion />);
    expect(screen.getByRole('dialog', { hidden: true }).hasAttribute('inert')).toBe(true);

    fireEvent.click(screen.getByText('abrir'));
    expect(screen.getByRole('dialog').hasAttribute('inert')).toBe(false);
  });

  it('Escape es una de las salidas', () => {
    const cerrar = vi.fn();
    render(<Anfitrion onCerrar={cerrar} />);
    fireEvent.click(screen.getByText('abrir'));

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(cerrar).toHaveBeenCalled();
  });

  it('el velo es otra', () => {
    const cerrar = vi.fn();
    render(<Anfitrion onCerrar={cerrar} />);
    fireEvent.click(screen.getByText('abrir'));

    const velo = screen.getByRole('dialog').parentElement!;
    fireEvent.mouseDown(velo);
    expect(cerrar).toHaveBeenCalled();
  });

  it('y el tirador está ahí, aunque no sea un control', () => {
    render(<Anfitrion />);
    const panel = screen.getByRole('dialog', { hidden: true });
    // Un indicador: sin nombre accesible, sin ser un botón. El gesto se lee en
    // todo el panel, no encima de la raya.
    expect(panel.querySelector('[aria-hidden="true"] .rounded-full')).toBeTruthy();
  });
});
