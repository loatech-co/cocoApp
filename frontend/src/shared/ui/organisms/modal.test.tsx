// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Modal } from './modal';

afterEach(cleanup);

function renderModal(props: Partial<Parameters<typeof Modal>[0]> = {}) {
  const onCerrar = vi.fn();
  const result = render(
    <Modal abierta titulo="Nueva cuenta" onCerrar={onCerrar} {...props}>
      <p>Contenido</p>
    </Modal>,
  );
  return { onCerrar, ...result };
}

describe('Modal', () => {
  it('renders nothing while closed', () => {
    renderModal({ abierta: false });

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('is a modal dialog named after its title', () => {
    renderModal({ ayuda: 'Una cuenta de banco o de efectivo.' });

    const dialog = screen.getByRole('dialog', { name: 'Nueva cuenta' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(within(dialog).getByRole('heading', { level: 2, name: 'Nueva cuenta' })).toBeTruthy();
    expect(within(dialog).getByText('Una cuenta de banco o de efectivo.')).toBeTruthy();
    expect(within(dialog).getByText('Contenido')).toBeTruthy();
  });

  it('places the extra actions next to the close button', () => {
    renderModal({ acciones: <button type="button">Eliminar</button> });

    const close = screen.getByRole('button', { name: 'Cerrar' });
    const remove = screen.getByRole('button', { name: 'Eliminar' });
    expect(close.parentElement).toBe(remove.parentElement);
  });

  it('closes with its close button', () => {
    const { onCerrar } = renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));

    expect(onCerrar).toHaveBeenCalledOnce();
  });

  it('closes with Escape', () => {
    const { onCerrar } = renderModal();

    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.keyDown(document, { key: 'Tab' });

    expect(onCerrar).toHaveBeenCalledOnce();
  });

  it('closes when the veil is pressed, not when the panel is', () => {
    const { onCerrar } = renderModal();

    fireEvent.mouseDown(screen.getByText('Contenido'));
    expect(onCerrar).not.toHaveBeenCalled();

    fireEvent.mouseDown(screen.getByRole('dialog'));
    expect(onCerrar).toHaveBeenCalledOnce();
  });

  it('stops listening for Escape once it closes', () => {
    const { onCerrar, rerender } = renderModal();

    rerender(
      <Modal abierta={false} titulo="Nueva cuenta" onCerrar={onCerrar}>
        <p>Contenido</p>
      </Modal>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onCerrar).not.toHaveBeenCalled();
  });
});
