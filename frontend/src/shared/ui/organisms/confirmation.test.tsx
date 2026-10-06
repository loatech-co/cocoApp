// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Confirmation } from './confirmation';

afterEach(cleanup);

function renderConfirmation(props: Partial<Parameters<typeof Confirmation>[0]> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <Confirmation
      isOpen
      title="Eliminar movimiento"
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...props}
    >
      El concepto sigue vivo.
    </Confirmation>,
  );
  return { onConfirm, onCancel };
}

const confirmButton = (name = 'Confirmar') =>
  screen.getByRole<HTMLButtonElement>('button', { name });

describe('Confirmation', () => {
  it('renders nothing while closed', () => {
    renderConfirmation({ isOpen: false });

    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('is a modal alert dialog named after its title, with its explanation', () => {
    renderConfirmation();

    const dialog = screen.getByRole('alertdialog', { name: 'Eliminar movimiento' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(screen.getByText('El concepto sigue vivo.')).toBeTruthy();
  });

  it('does not start with any button focused', () => {
    renderConfirmation();

    expect(document.activeElement).toBe(document.body);
  });

  it('confirms with its main button', () => {
    const { onConfirm, onCancel } = renderConfirmation();

    fireEvent.click(confirmButton());

    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('cancels with the outline button, with Escape and with the veil', () => {
    const { onCancel, onConfirm } = renderConfirmation();

    const cancel = screen.getByRole('button', { name: 'Cancelar' });
    expect(cancel.className).toContain('border');
    fireEvent.click(cancel);
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.keyDown(document, { key: 'Enter' });
    fireEvent.mouseDown(screen.getByRole('alertdialog'));
    fireEvent.mouseDown(screen.getByText('El concepto sigue vivo.'));

    expect(onCancel).toHaveBeenCalledTimes(3);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('names the confirm button with the action and paints it as destructive when dangerous', () => {
    renderConfirmation({ confirmLabel: 'Eliminar', isDestructive: true });

    expect(confirmButton('Eliminar').className).toContain('bg-destructive');
  });

  it('cannot be confirmed while busy or while the caller forbids it', () => {
    const { onConfirm } = renderConfirmation({ isBusy: true });
    fireEvent.click(confirmButton());
    expect(confirmButton().disabled).toBe(true);
    cleanup();

    const second = renderConfirmation({ isConfirmDisabled: true });
    fireEvent.click(confirmButton());

    expect(confirmButton().disabled).toBe(true);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(second.onConfirm).not.toHaveBeenCalled();
  });
});
