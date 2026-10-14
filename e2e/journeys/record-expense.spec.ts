import type { Locator, Page } from '@playwright/test';
import { join } from 'node:path';

import {
  movementRow,
  openMovement,
  openNewExpense,
  openNewExpenseByHand,
  pickConcept,
} from '../support/app';
import { expectAccessible } from '../support/axe';
import { FILES } from '../support/environment.mjs';
import { expect, test } from '../support/fixtures';
import { createConcept } from '../support/seed';

/**
 * Gives the sheet the receipt the way each screen offers it: the desktop
 * opens the upload panel; the phone has no drop box, and «Cargar una imagen»
 * is the system's picker straight away (no `capture`, so it also takes a PDF).
 */
async function attachReceipt(page: Page, sheet: Locator, isMobile: boolean): Promise<void> {
  const receipt = join(FILES, 'receipt.pdf');

  if (isMobile) {
    await expect(sheet.getByText('Agregar los soportes del movimiento')).toBeHidden();
    const chooser = page.waitForEvent('filechooser');
    await sheet.getByRole('button', { name: 'Cargar una imagen' }).click();
    await (await chooser).setFiles(receipt);
    return;
  }

  await sheet.getByRole('button', { name: 'Cargar archivo' }).click();
  const upload = page.getByRole('dialog', { name: 'Agregar soportes' });
  await upload.locator('input[type="file"]').setInputFiles(receipt);
}

/**
 * The phone's new transaction before choosing how it starts: the sources and
 * «Registrar manualmente», no fields, and only «Cancelar» at the foot. Closes
 * it again, so the journey can open it fresh.
 */
async function expectEntryGate(sheet: Locator, page: Page): Promise<void> {
  await expect(sheet.getByRole('button', { name: 'Registrar manualmente' })).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Tomar una foto' })).toBeVisible();
  await expect(sheet.getByRole('textbox', { name: 'Valor' })).toHaveCount(0);
  await expect(sheet.getByRole('button', { name: 'Registrar', exact: true })).toHaveCount(0);
  await expectAccessible(page, 'the entry gate of a new expense');
  await sheet.getByRole('button', { name: 'Cancelar' }).click();
  await expect(sheet).toBeHidden();
}

test.describe('registering an expense', () => {
  test('by hand: the form opens (on the phone, behind «Registrar manualmente») and the row appears', async ({
    page,
    account,
    signIn,
    isMobile,
  }) => {
    await createConcept(account.api, ['Costos variables', 'Licencias'], 'Mercado');
    await signIn();

    if (isMobile) await expectEntryGate(await openNewExpense(page), page);

    const sheet = await openNewExpenseByHand(page);
    await expect(sheet.getByRole('textbox', { name: 'Valor' })).toBeVisible();
    await expectAccessible(page, 'the new-expense sheet');

    await pickConcept(sheet, 'Merc', /Mercado/);
    await sheet.getByRole('textbox', { name: 'Valor' }).fill('32000');
    await sheet.getByRole('button', { name: 'Registrar' }).click();

    await expect(sheet).toBeHidden();
    await expect(movementRow(page, 'Mercado', '32.000')).toBeVisible();
  });

  test('with a file: the receipt fills the form and stays attached', async ({
    page,
    account,
    signIn,
    isMobile,
  }) => {
    // The receipt says "La Esquina": the keyword is what suggests the concept.
    await createConcept(account.api, ['Costos variables', 'Licencias'], 'Mercado', {
      keywords: ['La Esquina'],
    });
    await signIn();

    const sheet = await openNewExpense(page);
    await attachReceipt(page, sheet, isMobile);

    await expect(sheet.getByText('Los datos se extrajeron del soporte')).toBeVisible();
    await expect(sheet.getByRole('textbox', { name: 'Valor' })).toHaveValue('45.000');
    await expect(sheet.getByRole('button', { name: 'Concepto' })).toContainText('Mercado');
    await expectAccessible(page, 'the sheet with a receipt');

    await sheet.getByRole('button', { name: 'Registrar' }).click();
    await expect(sheet).toBeHidden();

    const row = movementRow(page, 'Mercado', '45.000');
    await expect(row).toBeVisible();
    await openMovement(page, 'Mercado', '45.000');
    const card = page.getByRole('dialog', { name: 'Editar movimiento' });
    await expect(card.getByRole('button', { name: 'Ver en grande' })).toBeVisible();
  });
});
