import { movementRow, payPending, pendingRow } from '../support/app';
import { expectAccessible } from '../support/axe';
import { expect, test } from '../support/fixtures';
import { createConcept, createExpense } from '../support/seed';

/** Rent: a monthly concept in the static centre, due on day 1. */
const RENT = {
  isRecurring: true,
  periodicity: 'monthly',
  paymentDay: 1,
  budget: 1_000_000,
} as const;

test.describe('pending payments', () => {
  test('a recurring concept not yet paid is pending, and paying it clears it', async ({
    page,
    account,
    signIn,
  }) => {
    await createConcept(account.api, ['Costos fijos', 'Vivienda'], 'Arriendo', RENT);
    await signIn();

    const pending = pendingRow(page, 'Arriendo');
    await expect(page.getByRole('heading', { name: 'Pagos pendientes' })).toBeVisible();
    await expect(pending).toContainText('Arriendo');
    await expect(pending).toContainText('$ 1.000.000');
    await expectAccessible(page, 'the summary with a pending payment');

    // Paying it from the list: the sheet opens with the concept and the budget.
    await payPending(page, 'Arriendo');
    const sheet = page.getByRole('dialog', { name: 'Nuevo movimiento' });
    await expect(sheet.getByRole('button', { name: 'Concepto' })).toContainText('Arriendo');
    await expect(sheet.getByRole('textbox', { name: 'Valor' })).toHaveValue('1.000.000');
    await sheet.getByRole('button', { name: 'Registrar' }).click();

    await expect(sheet).toBeHidden();
    await expect(movementRow(page, 'Arriendo', '1.000.000')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Pagos pendientes' })).toBeHidden();
  });

  test('a concept paid in several instalments shows how much it carries', async ({
    page,
    account,
    signIn,
    isMobile,
  }) => {
    const rent = await createConcept(account.api, ['Costos fijos', 'Vivienda'], 'Arriendo', RENT);
    await createExpense(account.api, rent, 400_000);
    await signIn();

    // Paid in part and NOT marked: one payment is enough to clear it.
    await expect(page.getByRole('heading', { name: 'Pagos pendientes' })).toBeHidden();

    await page.goto('/cost-centers');
    await page.getByRole('button', { name: /Arriendo$/ }).click();
    const card = page.getByRole('dialog', { name: 'Editar concepto' });
    await card.getByRole('switch', { name: /Se completa en varios pagos/ }).click();
    await expect(card.getByRole('switch', { name: /Se completa en varios pagos/ })).toBeChecked();
    await expectAccessible(page, 'the concept card');
    await card.getByRole('button', { name: 'Guardar' }).click();
    await expect(card).toBeHidden();

    await page.goto('/');
    if (isMobile) {
      // On the phone it is a plain fact of the open drawer, without a bar.
      await pendingRow(page, 'Arriendo').getByRole('button', { expanded: false }).click();
      await expect(pendingRow(page, 'Arriendo')).toContainText('$ 400.000 de $ 1.000.000');
      await expectAccessible(page, 'the summary with an instalment in progress');
      return;
    }
    const progress = page.getByRole('progressbar', { name: /Arriendo/ });
    await expect(progress).toHaveAccessibleName('Arriendo: lleva $ 400.000 de $ 1.000.000');
    await expect(page.getByText('Lleva $ 400.000')).toBeVisible();
    await expectAccessible(page, 'the summary with an instalment in progress');
  });
});
