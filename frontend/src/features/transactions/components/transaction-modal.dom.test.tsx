// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { keys } from '@/shared/api/query-keys';
import {
  TREE,
  TRANSACTION,
  PAYMENT,
  SPLIT_PAYMENT,
  openConfirmation,
  openSheet,
  openNew,
  treeWith,
  testQueryClient,
  renderSheet,
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
 * A transaction's sheet, opened to EDIT, has to arrive with its
 * classification set.
 *
 * It is what you come to check when you open an already recorded transaction —«what
 * did this end up classified as?»—, and if the three dropdowns appear empty the
 * form is saying it is not classified, which is something else. Worse: on
 * saving any correction of the amount, that lie would be saved too.
 *
 * It is tested through the whole sheet and not through `selectedPath` —which already has
 * its own— because the failure this guards against is not in the search through the
 * tree: it is in whether what is searched for arrives, and when.
 */
describe('The sheet of a transaction being edited', () => {
  it('arrives with its cost center, its category and its concept set', () => {
    openSheet(TREE);

    // The sheet opens in read mode: the fields unlock when asked.
    fireEvent.click(screen.getByRole('button', { name: 'Editar movimiento' }));

    // The door is the search: it shows the concept with its whole path.
    expect(screen.getByRole('button', { name: /Concepto/ }).textContent).toContain(
      'Celsia (Energía)',
    );
    expect(screen.getByText(/Servicios públicos › Costos fijos/)).toBeDefined();

    // And the cascade still exists, behind its link, with all three set.
    fireEvent.click(screen.getByRole('button', { name: 'Elegir por centro y categoría' }));
    for (const name of ['Centro de costos', 'Categoría']) {
      const trigger = screen.getByRole('button', { name: new RegExp(name) });
      expect(trigger, `the ${name} dropdown`).toBeDefined();
    }
    expect(screen.getByText('Costos fijos')).toBeDefined();
    expect(screen.getByText('Servicios públicos')).toBeDefined();
    expect(screen.getAllByText('Celsia (Energía)').length).toBeGreaterThan(0);
  });

  it('shows them even when they are LOCKED for belonging to a static center', () => {
    /*
      The failure this fixes: `Combo`, when locked, painted the placeholder and
      ignored what was picked. In a static center the three dropdowns come out
      locked on purpose —that classification is not touched from here—, so
      a well-classified transaction read as an unclassified one.

      Locked means «this is not changed from here», never «this is
      empty».
    */
    openSheet(treeWith(true));

    fireEvent.click(screen.getByRole('button', { name: 'Editar movimiento' }));

    // In a static center there is nothing to pick but there is something to read: the
    // search and the cascade come out locked and both say what it is.
    expect(screen.getByText('Costos fijos')).toBeDefined();
    expect(screen.getByText('Servicios públicos')).toBeDefined();
    expect(screen.getAllByText('Celsia (Energía)').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /Concepto/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Elegir por centro y categoría' })).toBeNull();
  });

  it('also when the category tree arrives AFTER it opens', async () => {
    // The real case: the sheet opens before the categories query
    // responds. If the classification were resolved only once on mount, the
    // three dropdowns would stay empty forever.
    const client = testQueryClient();
    renderSheet({ transaction: TRANSACTION }, client);

    fireEvent.click(screen.getByRole('button', { name: 'Editar movimiento' }));
    client.setQueryData([...keys.categories, 'todas'], TREE);

    expect(await screen.findByText(/Servicios públicos › Costos fijos/)).toBeDefined();
    expect(screen.getAllByText('Celsia (Energía)').length).toBeGreaterThan(0);
  });
});

/**
 * The CONFIRM A PAYMENT sheet.
 *
 * It is opened from the dashboard's pending payments card, and it is the same sheet
 * as always with another starting point: the concept is already known, the amount and the
 * date are the expected ones, and the only thing missing is the paper that corrects them.
 *
 * What is guarded here is that it arrives FILLED IN. A confirm sheet that opens
 * blank forces copying by hand, while looking at the same card that was just
 * pressed, three facts the app already had.
 */
describe('The sheet to confirm a pending payment', () => {
  it('is titled «Confirmar pago» and says which one', () => {
    openConfirmation();

    expect(screen.getByRole('heading', { name: 'Confirmar pago' })).toBeDefined();
    expect(screen.getByText(/Celsia \(Energía\)\./)).toBeDefined();
  });

  it('arrives with the expected amount and the due date set', () => {
    openConfirmation();

    // It is shown grouped and saved without dots.
    expect(screen.getByLabelText<HTMLInputElement>('Valor').value).toBe('180.000');
    expect(screen.getByLabelText<HTMLInputElement>('Fecha').value).toMatch(/octubre/i);
  });

  it('arrives with its classification set, without asking for it again', () => {
    openConfirmation();

    expect(screen.getByText(/Servicios públicos › Costos fijos/)).toBeDefined();
    expect(screen.getAllByText('Celsia (Energía)').length).toBeGreaterThan(0);
  });

  it('opens straight into the form, with no screen in front', () => {
    openConfirmation();

    expect(screen.getByLabelText('Valor')).toBeDefined();
    expect(screen.queryByText('Registrar manualmente')).toBeNull();
    expect(screen.queryByText('Subir un archivo')).toBeNull();
  });

  it('warns that the amount is an expected value, not a fact', () => {
    // Without this, a three-month average looks the same as a figure copied from the
    // receipt, and whoever confirms without looking records the average.
    openConfirmation();

    expect(screen.getByText(/son los esperados/i)).toBeDefined();
  });

  it('a concept that has never been paid opens with no amount, and says so differently', () => {
    openConfirmation({ ...PAYMENT, expectedAmount: null });

    expect(screen.getByLabelText<HTMLInputElement>('Valor').value).toBe('');
    expect(screen.getByText(/se leen el valor y la fecha/i)).toBeDefined();
  });

  it('without a pending payment, a new transaction also opens in the form', () => {
    // The «cómo empezar» screen that was in front was removed: it cost a
    // click on every new transaction for a question that was almost always
    // answered the same way. Its other two paths now live inside the form.
    openNew();

    expect(screen.getByRole('heading', { name: /Nuevo/ })).toBeDefined();
    expect(screen.getByLabelText('Valor')).toBeDefined();
    expect(screen.queryByText('Registrar manualmente')).toBeNull();
    expect(screen.getByRole('button', { name: 'Cargar archivo' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Tomar foto' })).toBeDefined();
  });
});

/**
 * Paying in installments is not confirming.
 *
 * A regular concept is CONFIRMED: what it is expected to cost is what it is going to
 * cost, and bringing it written saves a step. One paid in several installments is
 * PAID DOWN, and then the expected amount is the worst possible suggestion: at the first
 * «guardar» without looking, the month is covered at once and the concept leaves the
 * list as if it were settled.
 */
describe('The sheet of a concept paid in several installments', () => {
  /** Today in America/Bogotá, as the app writes it. */
  function today(): Date {
    return new Date(Date.now() - 5 * 60 * 60 * 1000);
  }

  it('opens with the amount EMPTY, not with the month total', () => {
    openConfirmation(SPLIT_PAYMENT);

    expect(screen.getByLabelText<HTMLInputElement>('Valor').value).toBe('');
  });

  it('and with TODAY as the date, not the due date', () => {
    // The trip to the market was today. The due date is when the cycle
    // starts counting, not when this was spent.
    openConfirmation(SPLIT_PAYMENT);

    const date = screen.getByLabelText<HTMLInputElement>('Fecha').value;
    expect(date).toContain(String(today().getUTCDate()));
    expect(date).not.toContain('25');
  });

  it('is titled «Registrar otro», which is what the list offered', () => {
    // Opening «Registrar otro» and finding «Confirmar pago» is promising that
    // this closes the month.
    openConfirmation(SPLIT_PAYMENT);

    expect(screen.getByRole('heading', { name: 'Registrar otro' })).toBeDefined();
  });

  it('warns that what is noted down is THIS time', () => {
    // Without saying so, the empty box reads as a field still to be filled
    // with the total, which is exactly the opposite.
    openConfirmation(SPLIT_PAYMENT);

    expect(screen.getByText(/no el total del mes/i)).toBeDefined();
  });

  it('but the classification does come set, as in any payment', () => {
    // What changes is the amount and the date; which concept it is, does not.
    openConfirmation(SPLIT_PAYMENT);

    expect(screen.getByText(/Servicios públicos › Costos fijos/)).toBeDefined();
    expect(screen.getAllByText('Celsia (Energía)').length).toBeGreaterThan(0);
  });

  it('and a regular one still arrives with its expected amount', () => {
    // The test that keeps it from being «fixed» for everyone: rent is confirmed.
    openConfirmation(PAYMENT);

    expect(screen.getByLabelText<HTMLInputElement>('Valor').value).toBe('180.000');
  });
});
