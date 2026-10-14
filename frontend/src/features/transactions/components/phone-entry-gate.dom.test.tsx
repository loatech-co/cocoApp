// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readReceipt } from '@/features/transactions/api/read-receipt';
import {
  CELSIA_READING,
  TREE,
  atWidth,
  fakeReceiptBrowser,
  openConfirmation,
  openNew,
  openSheet,
} from '@/test-support/transaction-sheet';

vi.mock('@/features/transactions/api/read-receipt', () => ({
  readReceipt: vi.fn(),
}));

/** The names of the buttons at the foot of the sheet, in order. */
function footer(): string[] {
  const cancel = screen.getByRole('button', { name: 'Cancelar' });
  return within(cancel.parentElement!)
    .getAllByRole('button')
    .map((b) => b.textContent);
}

afterEach(() => {
  cleanup();
  atWidth(false);
});

/**
 * A new transaction on the phone starts from the receipt or by hand, and the
 * fields wait until one of the two is chosen.
 */
describe('The entry gate of a new transaction, on the phone', () => {
  beforeEach(() => {
    atWidth(true);
    fakeReceiptBrowser();
  });

  it('shows the three sources and «Registrar manualmente», no fields, and only «Cancelar»', () => {
    openNew();

    for (const name of ['Tomar una foto', 'Pegar una captura', 'Cargar una imagen']) {
      expect(screen.getByRole('button', { name })).toBeDefined();
    }
    expect(screen.getByRole('button', { name: 'Registrar manualmente' })).toBeDefined();
    expect(screen.queryByLabelText('Valor')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Concepto' })).toBeNull();
    expect(footer()).toEqual(['Cancelar']);
  });

  it('opens the form on «Registrar manualmente», with the sources compact above it', async () => {
    vi.useFakeTimers();
    openNew();

    fireEvent.click(screen.getByRole('button', { name: 'Registrar manualmente' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(screen.getByLabelText('Valor')).toBeDefined();
    expect(screen.getByLabelText('Notas')).toBeDefined();
    expect(document.activeElement?.id).toBe('tx-concept');
    expect(screen.queryByRole('button', { name: 'Registrar manualmente' })).toBeNull();
    // Still there, but icon only: the name is for the ear.
    expect(screen.getByRole('button', { name: 'Tomar una foto' }).textContent).toBe('');
    expect(footer()).toEqual(['Cancelar', 'Registrar']);
    vi.useRealTimers();
  });

  it('opens the form after a receipt source, filled by the reading', async () => {
    vi.useFakeTimers();
    vi.mocked(readReceipt).mockResolvedValue(CELSIA_READING);
    const { container } = openNew();
    const library = container.querySelectorAll<HTMLInputElement>('input[type="file"]')[1]!;

    fireEvent.change(library, {
      target: { files: [new File(['x'], 'recibo.pdf', { type: 'application/pdf' })] },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });

    expect(screen.getByLabelText<HTMLInputElement>('Valor').value).toBe('214.500');
    expect(screen.queryByRole('button', { name: 'Registrar manualmente' })).toBeNull();
    expect(footer()).toEqual(['Cancelar', 'Registrar']);
    vi.useRealTimers();
    vi.mocked(readReceipt).mockReset();
  });

  it('opens an existing transaction past the gate, and edits it there', () => {
    openSheet(TREE);

    expect(screen.queryByRole('button', { name: 'Registrar manualmente' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Editar movimiento' }));
    expect(screen.getByLabelText('Valor')).toBeDefined();
    expect(footer()).toEqual(['Cancelar', 'Guardar']);
  });

  it('opens the confirmation of a pending payment past the gate: its data is there', () => {
    openConfirmation();

    expect(screen.queryByRole('button', { name: 'Registrar manualmente' })).toBeNull();
    expect(screen.getByLabelText('Valor')).toBeDefined();
  });
});

describe('A new transaction, on the desktop', () => {
  it('opens straight into the form, with no gate', () => {
    atWidth(false);
    openNew();

    expect(screen.queryByRole('button', { name: 'Registrar manualmente' })).toBeNull();
    expect(screen.getByLabelText('Valor')).toBeDefined();
    expect(footer()).toEqual(['Cancelar', 'Registrar']);
  });
});
