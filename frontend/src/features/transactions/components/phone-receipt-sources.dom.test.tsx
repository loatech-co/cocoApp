// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readReceipt } from '@/features/transactions/api/read-receipt';
import {
  CELSIA_READING,
  atWidth,
  fakeReceiptBrowser,
  openNew,
} from '@/test-support/transaction-sheet';

vi.mock('@/features/transactions/api/read-receipt', () => ({
  readReceipt: vi.fn(),
}));

function fileFields(container: HTMLElement): HTMLInputElement[] {
  return Array.from(container.querySelectorAll<HTMLInputElement>('input[type="file"]'));
}

afterEach(() => {
  cleanup();
  atWidth(false);
});

/**
 * The new transaction on the phone: three ways to give the receipt, no drop
 * box, and the buttons of the foot always in reach.
 */
describe('The receipt column of a new transaction, on the phone', () => {
  beforeEach(() => {
    atWidth(true);
    fakeReceiptBrowser();
  });

  it('offers exactly three buttons, in order, and no drop box', () => {
    openNew();

    const sources = screen.getByRole('button', { name: 'Tomar una foto' }).parentElement!;
    expect(
      within(sources)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Tomar una foto', 'Pegar una captura', 'Cargar una imagen']);

    expect(screen.queryByText('Agregar los soportes del movimiento')).toBeNull();
    expect(screen.queryByText(/Arrastrarlos aquí/)).toBeNull();
    expect(screen.queryByText('PDF, JPG, PNG, HEIC o WEBP')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cargar archivo' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Tomar foto' })).toBeNull();
  });

  it('opens the system camera for the photo and the system menu for the image', () => {
    const { container } = openNew();
    const [camera, library] = fileFields(container);

    expect(camera?.accept).toBe('image/*');
    expect(camera?.getAttribute('capture')).toBe('environment');
    expect(camera?.multiple).toBe(false);

    expect(library?.hasAttribute('capture')).toBe(false);
    expect(library?.accept).toContain('application/pdf');
    expect(library?.accept).toContain('image/heic');
    expect(library?.multiple).toBe(true);
  });

  it('reads the photo taken and fills the form, as any other receipt', async () => {
    vi.useFakeTimers();
    vi.mocked(readReceipt).mockResolvedValue(CELSIA_READING);
    const { container } = openNew();
    const [camera] = fileFields(container);

    fireEvent.change(camera!, {
      target: { files: [new File(['x'], 'foto.jpg', { type: 'image/jpeg' })] },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });

    expect(vi.mocked(readReceipt).mock.calls[0]?.[0]?.name).toBe('foto.jpg');
    expect(screen.getByLabelText<HTMLInputElement>('Valor').value).toBe('214.500');
    vi.useRealTimers();
    vi.mocked(readReceipt).mockReset();
  });

  it('keeps «Registrar» and «Cancelar» outside what scrolls, at the foot', () => {
    openNew();
    fireEvent.click(screen.getByRole('button', { name: 'Registrar manualmente' }));

    const register = screen.getByRole('button', { name: 'Registrar' });
    const valueField = screen.getByLabelText('Valor');
    const scroller = valueField.closest('.mobile\\:overflow-y-auto');

    expect(scroller).not.toBeNull();
    expect(scroller?.contains(register)).toBe(false);
    expect(scroller?.contains(screen.getByRole('button', { name: 'Cancelar' }))).toBe(false);
  });
});

describe('The receipt column of a new transaction, on the desktop', () => {
  it('keeps the drop box, «Cargar archivo» and «Tomar foto»', () => {
    atWidth(false);
    openNew();

    expect(screen.getByText('Agregar los soportes del movimiento')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Cargar archivo' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Tomar foto' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Tomar una foto' })).toBeNull();
  });
});
