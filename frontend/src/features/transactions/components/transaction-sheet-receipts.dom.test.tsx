// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readReceipt } from '@/features/transactions/api/read-receipt';
import {
  CELSIA_READING,
  openConfirmation,
  openNew,
  fakeReceiptBrowser,
} from '@/test-support/transaction-sheet';

/*
  The receipt reader, faked.

  The real one opens a PDF with pdf.js or fires up Tesseract, which have no
  business in a test of this sheet: what is checked here is what happens
  AFTER reading, not how it is read. The keyword tests already cover that, and the
  reading package.
*/
vi.mock('@/features/transactions/api/read-receipt', () => ({
  readReceipt: vi.fn(),
}));

afterEach(cleanup);

/**
 * And the receipt CORRECTS what was filled in.
 *
 * It is the other half of confirming a payment: the fields open with the expected —the
 * average of the previous months and the day it was due— and the receipt says what
 * really happened. Attaching it and having nothing change left the receipt as
 * decoration and forced typing, while looking at the paper, what the app can read.
 */
describe('The receipt attached when confirming a payment', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fakeReceiptBrowser();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.mocked(readReceipt).mockReset();
  });

  it('replaces the expected amount and date with the ones on the receipt', async () => {
    vi.mocked(readReceipt).mockResolvedValue(CELSIA_READING);

    const { container } = openConfirmation();

    expect(screen.getByLabelText<HTMLInputElement>('Valor').value).toBe('180.000');

    const field = container.querySelector('input[type="file"]')!;
    const receipt = new File(['x'], 'celsia-octubre.png', { type: 'image/png' });
    fireEvent.change(field, { target: { files: [receipt] } });

    /*
      The floor of the wait: the reading always looks the same, however long it takes.

      And inside `act`, which is not decoration. The `setStep('form')` that closes
      the reading runs inside a FAKE timer, outside any
      React event; so React schedules it through its `Scheduler`, which in
      jsdom also uses `setTimeout`, and the test depended on the
      fake timers picking up that task before the assertion. They
      did if another test in the file had run first and not if this one ran
      alone: it passed in the full file and failed in isolation, every time. `act`
      flushes React's pending work when it finishes, and the test stops
      depending on who runs first.
    */
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });

    expect(vi.mocked(readReceipt)).toHaveBeenCalledOnce();
    expect(screen.getByLabelText<HTMLInputElement>('Valor').value).toBe('214.500');
    expect(screen.getByLabelText<HTMLInputElement>('Fecha').value).toMatch(/2 de octubre/i);
  });

  it('on a new transaction, the first receipt is read too', async () => {
    // It used to be read only when confirming a payment: whoever tapped «Registrar
    // manualmente» on the «cómo empezar» had said they were going to type it. That
    // screen no longer exists, so there is no choice to respect: what was read
    // comes in as a proposal to verify, same as when confirming a payment.
    vi.mocked(readReceipt).mockResolvedValue(CELSIA_READING);

    const { container } = openNew();

    const field = container.querySelector('input[type="file"]')!;
    fireEvent.change(field, {
      target: { files: [new File(['x'], 'recibo.png', { type: 'image/png' })] },
    });

    // In `act` for the same reason as the test above.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });

    expect(vi.mocked(readReceipt)).toHaveBeenCalledOnce();
    expect(screen.getByLabelText<HTMLInputElement>('Valor').value).toBe('214.500');
  });
});

/**
 * The two paths that lived in the «cómo empezar», now inside the form.
 *
 * What a file or a photo does to the sheet is EXACTLY what it did before
 * —it is read, fills the fields and stays as the preview—; the only thing that
 * changed is where it is triggered from.
 */
describe('Cargar archivo and Tomar foto, inside the form', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fakeReceiptBrowser();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.mocked(readReceipt).mockReset();
  });

  it('«Cargar archivo» opens the upload panel, and what is given there is read and fills the form', async () => {
    vi.mocked(readReceipt).mockResolvedValue(CELSIA_READING);
    openNew();

    expect(screen.queryByRole('dialog', { name: 'Agregar soportes' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Cargar archivo' }));

    const panel = screen.getByRole('dialog', { name: 'Agregar soportes' });
    const field = panel.querySelector('input[type="file"]')!;
    fireEvent.change(field, {
      target: { files: [new File(['x'], 'celsia-octubre.png', { type: 'image/png' })] },
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });

    expect(vi.mocked(readReceipt)).toHaveBeenCalledOnce();
    expect(vi.mocked(readReceipt).mock.calls[0]?.[0]?.name).toBe('celsia-octubre.png');
    // The panel closed, the form was filled and the file stays as the
    // preview in the document column.
    expect(screen.queryByRole('dialog', { name: 'Agregar soportes' })).toBeNull();
    expect(screen.getByLabelText<HTMLInputElement>('Valor').value).toBe('214.500');
    expect(screen.getByLabelText<HTMLInputElement>('Fecha').value).toMatch(/2 de octubre/i);
    expect(screen.getByRole('button', { name: 'Quitar este soporte' })).toBeDefined();
  });

  it('«Tomar foto» switches to the camera, and cancelling goes back to the form', () => {
    openNew();

    fireEvent.click(screen.getByRole('button', { name: 'Tomar foto' }));

    // jsdom has no camera: the view says so and «Capturar» stays disabled. What
    // is checked is that the sheet IS on the camera, not that it captures.
    expect(screen.getByText(/No se detectó ninguna cámara/)).toBeDefined();
    expect(screen.getByRole('button', { name: /Capturar/ })).toBeDefined();
    expect(screen.queryByLabelText('Valor')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Cancelar/ }));

    expect(screen.getByLabelText('Valor')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Tomar foto' })).toBeDefined();
  });
});
