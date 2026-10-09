import { movementRow, openNewExpense } from '../support/app';
import { expectAccessible } from '../support/axe';
import { expect, test } from '../support/fixtures';
import { createConcept } from '../support/semilla';

test.describe('the concept finder', () => {
  test('finds a concept by one of its keywords', async ({ page, cuenta, entrar }) => {
    await createConcept(cuenta.api, ['Costos variables', 'Licencias'], 'Mercado', {
      keywords: ['Supertienda'],
    });
    await createConcept(cuenta.api, ['Costos fijos', 'Vivienda'], 'Arriendo');
    await entrar();

    const sheet = await openNewExpense(page);
    await sheet.getByRole('button', { name: 'Concepto' }).click();
    await sheet.getByRole('textbox', { name: 'Buscar concepto o categoría' }).fill('supertienda');

    const results = sheet.getByRole('listbox', { name: 'Resultados' });
    await expect(results.getByRole('option', { name: /Mercado/ })).toBeVisible();
    await expect(results.getByRole('option', { name: /Arriendo/ })).toHaveCount(0);
    await expectAccessible(page, 'the open concept finder');

    await results.getByRole('option', { name: /Mercado/ }).click();
    await expect(sheet.getByRole('button', { name: 'Concepto' })).toContainText('Mercado');

    // The cascade's center is a combo: its search box is the combobox and the
    // arrows walk the list without taking the caret out of it.
    await sheet.getByRole('button', { name: 'Elegir por centro y categoría' }).click();
    await sheet.getByRole('button', { name: 'Centro de costos' }).click();
    const box = page.getByRole('combobox', { name: 'Centro de costos' });
    await expect(box).toBeFocused();
    await box.fill('fijos');
    await expect(page.getByRole('listbox', { name: 'Centro de costos' })).toBeVisible();
    await expectAccessible(page, 'the open cost-center combo');

    // The empty row first, then the only match.
    await box.press('ArrowDown');
    await box.press('ArrowDown');
    await expect(box).toHaveAttribute('aria-activedescendant', /.+/);
    await box.press('Enter');
    await expect(sheet.getByRole('button', { name: 'Centro de costos' })).toContainText(
      'Costos fijos',
    );
  });

  test('creates the concept that is missing, in the category chosen', async ({ page, entrar }) => {
    await entrar();

    const sheet = await openNewExpense(page);
    await sheet.getByRole('button', { name: 'Concepto' }).click();
    await sheet.getByRole('textbox', { name: 'Buscar concepto o categoría' }).fill('Panadería');
    await sheet.getByRole('button', { name: 'Crear concepto «Panadería»' }).click();

    await expect(sheet.getByText('¿En qué categoría va «Panadería»?')).toBeVisible();
    await expectAccessible(page, 'choosing the category of a new concept');
    await sheet
      .getByRole('listbox', { name: 'Categorías' })
      .getByRole('option', { name: /Licencias/ })
      .click();

    await expect(sheet.getByRole('button', { name: 'Concepto' })).toContainText('Panadería');
    await sheet.getByRole('textbox', { name: 'Valor' }).fill('8500');
    await sheet.getByRole('button', { name: 'Registrar' }).click();
    await expect(movementRow(page, 'Panadería', '8.500')).toBeVisible();
  });
});
