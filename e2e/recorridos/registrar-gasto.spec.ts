import { join } from 'node:path';

import { movementRow, openNewExpense, pickConcept } from '../support/app';
import { expectAccessible } from '../support/axe';
import { FILES } from '../support/entorno.mjs';
import { expect, test } from '../support/fixtures';
import { createConcept } from '../support/semilla';

test.describe('registering an expense', () => {
  test('by hand: the form opens straight away and the row appears', async ({
    page,
    cuenta,
    entrar,
  }) => {
    await createConcept(cuenta.api, ['Costos variables', 'Licencias'], 'Mercado');
    await entrar();

    const sheet = await openNewExpense(page);
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
    cuenta,
    entrar,
  }) => {
    // The receipt says "La Esquina": the keyword is what suggests the concept.
    await createConcept(cuenta.api, ['Costos variables', 'Licencias'], 'Mercado', {
      keywords: ['La Esquina'],
    });
    await entrar();

    const sheet = await openNewExpense(page);
    await sheet.getByRole('button', { name: 'Cargar archivo' }).click();
    const upload = page.getByRole('dialog', { name: 'Agregar soportes' });
    await upload.locator('input[type="file"]').setInputFiles(join(FILES, 'recibo.pdf'));

    await expect(sheet.getByText('Los datos se extrajeron del soporte')).toBeVisible();
    await expect(sheet.getByRole('textbox', { name: 'Valor' })).toHaveValue('45.000');
    await expect(sheet.getByRole('button', { name: 'Concepto' })).toContainText('Mercado');
    await expectAccessible(page, 'the sheet with a receipt');

    await sheet.getByRole('button', { name: 'Registrar' }).click();
    await expect(sheet).toBeHidden();

    const row = movementRow(page, 'Mercado', '45.000');
    await expect(row).toBeVisible();
    await row.getByRole('cell', { name: 'Mercado', exact: true }).click();
    const card = page.getByRole('dialog', { name: 'Editar movimiento' });
    await expect(card.getByRole('button', { name: 'Ver en grande' })).toBeVisible();
  });
});
