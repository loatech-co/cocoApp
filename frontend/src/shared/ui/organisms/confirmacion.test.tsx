// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Confirmacion } from './confirmacion';

afterEach(cleanup);

function renderConfirmation(props: Partial<Parameters<typeof Confirmacion>[0]> = {}) {
  const onConfirmar = vi.fn();
  const onCancelar = vi.fn();
  render(
    <Confirmacion
      abierta
      titulo="Eliminar movimiento"
      onConfirmar={onConfirmar}
      onCancelar={onCancelar}
      {...props}
    >
      El concepto sigue vivo.
    </Confirmacion>,
  );
  return { onConfirmar, onCancelar };
}

const confirmButton = (name = 'Confirmar') =>
  screen.getByRole<HTMLButtonElement>('button', { name });

describe('Confirmacion', () => {
  it('renders nothing while closed', () => {
    renderConfirmation({ abierta: false });

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
    const { onConfirmar, onCancelar } = renderConfirmation();

    fireEvent.click(confirmButton());

    expect(onConfirmar).toHaveBeenCalledOnce();
    expect(onCancelar).not.toHaveBeenCalled();
  });

  it('cancels with the outline button, with Escape and with the veil', () => {
    const { onCancelar, onConfirmar } = renderConfirmation();

    const cancel = screen.getByRole('button', { name: 'Cancelar' });
    expect(cancel.className).toContain('border');
    fireEvent.click(cancel);
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.keyDown(document, { key: 'Enter' });
    fireEvent.mouseDown(screen.getByRole('alertdialog'));
    fireEvent.mouseDown(screen.getByText('El concepto sigue vivo.'));

    expect(onCancelar).toHaveBeenCalledTimes(3);
    expect(onConfirmar).not.toHaveBeenCalled();
  });

  it('names the confirm button with the action and paints it as destructive when dangerous', () => {
    renderConfirmation({ etiquetaConfirmar: 'Eliminar', peligrosa: true });

    expect(confirmButton('Eliminar').className).toContain('bg-destructive');
  });

  it('cannot be confirmed while busy or while the caller forbids it', () => {
    const { onConfirmar } = renderConfirmation({ ocupada: true });
    fireEvent.click(confirmButton());
    expect(confirmButton().disabled).toBe(true);
    cleanup();

    const second = renderConfirmation({ confirmarDeshabilitado: true });
    fireEvent.click(confirmButton());

    expect(confirmButton().disabled).toBe(true);
    expect(onConfirmar).not.toHaveBeenCalled();
    expect(second.onConfirmar).not.toHaveBeenCalled();
  });
});
