// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Modal } from './modal';

afterEach(cleanup);

function renderModal(props: Partial<Parameters<typeof Modal>[0]> = {}) {
  const onClose = vi.fn();
  const result = render(
    <Modal isOpen title="Nueva cuenta" onClose={onClose} {...props}>
      <p>Contenido</p>
    </Modal>,
  );
  return { onClose, ...result };
}

describe('Modal', () => {
  it('renders nothing while closed', () => {
    renderModal({ isOpen: false });

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('is a modal dialog named after its title', () => {
    renderModal({ description: 'Una cuenta de banco o de efectivo.' });

    const dialog = screen.getByRole('dialog', { name: 'Nueva cuenta' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(within(dialog).getByRole('heading', { level: 2, name: 'Nueva cuenta' })).toBeTruthy();
    expect(within(dialog).getByText('Una cuenta de banco o de efectivo.')).toBeTruthy();
    expect(within(dialog).getByText('Contenido')).toBeTruthy();
  });

  it('places the extra actions next to the close button', () => {
    renderModal({ actions: <button type="button">Eliminar</button> });

    const close = screen.getByRole('button', { name: 'Cerrar' });
    const remove = screen.getByRole('button', { name: 'Eliminar' });
    expect(close.parentElement).toBe(remove.parentElement);
  });

  it('closes with its close button', () => {
    const { onClose } = renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('closes with Escape', () => {
    const { onClose } = renderModal();

    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.keyDown(document, { key: 'Tab' });

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('closes when the veil is pressed, not when the panel is', () => {
    const { onClose } = renderModal();

    fireEvent.mouseDown(screen.getByText('Contenido'));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.mouseDown(screen.getByRole('dialog'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('stops listening for Escape once it closes', () => {
    const { onClose, rerender } = renderModal();

    rerender(
      <Modal isOpen={false} title="Nueva cuenta" onClose={onClose}>
        <p>Contenido</p>
      </Modal>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).not.toHaveBeenCalled();
  });
});
