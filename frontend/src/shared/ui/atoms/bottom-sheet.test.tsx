// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BottomSheet } from './bottom-sheet';

afterEach(cleanup);

function Host({ onClose }: { onClose?: () => void }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)}>
        abrir
      </button>
      <BottomSheet
        isOpen={isOpen}
        title="Atajos"
        onClose={() => {
          setIsOpen(false);
          onClose?.();
        }}
      >
        <p>lo de dentro</p>
      </BottomSheet>
    </>
  );
}

describe('El panel inferior', () => {
  it('está montado antes de abrirse: lo que se desliza no se reconstruye', () => {
    render(<Host />);
    const panel = screen.getByRole('dialog', { hidden: true });

    expect(panel.dataset.abierta).toBe('no');

    // El MISMO nodo después de abrir. Uno reconstruido no tendría posición
    // anterior desde la que viajar: aparecería, nunca llegaría.
    fireEvent.click(screen.getByText('abrir'));
    expect(screen.getByRole('dialog').isSameNode(panel)).toBe(true);
    expect(panel.dataset.abierta).toBe('si');
  });

  it('cerrado no se tabula', () => {
    render(<Host />);
    expect(screen.getByRole('dialog', { hidden: true }).hasAttribute('inert')).toBe(true);

    fireEvent.click(screen.getByText('abrir'));
    expect(screen.getByRole('dialog').hasAttribute('inert')).toBe(false);
  });

  it('Escape es una de las salidas', () => {
    const close = vi.fn();
    render(<Host onClose={close} />);
    fireEvent.click(screen.getByText('abrir'));

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(close).toHaveBeenCalled();
  });

  it('el velo es otra', () => {
    const close = vi.fn();
    render(<Host onClose={close} />);
    fireEvent.click(screen.getByText('abrir'));

    const overlay = screen.getByRole('dialog').parentElement!;
    fireEvent.mouseDown(overlay);
    expect(close).toHaveBeenCalled();
  });

  it('y el tirador está ahí, aunque no sea un control', () => {
    render(<Host />);
    const panel = screen.getByRole('dialog', { hidden: true });
    // Un indicador: sin nombre accesible, sin ser un botón. El gesto se lee en
    // todo el panel, no encima de la raya.
    expect(panel.querySelector('[aria-hidden="true"] .rounded-full')).toBeTruthy();
  });
});
