import { movementRow } from '../support/app';
import { expectAccessible } from '../support/axe';
import { expect, test } from '../support/fixtures';
import { createConcept, createExpense } from '../support/semilla';

test.describe('a movement', () => {
  test.beforeEach(async ({ cuenta, entrar }) => {
    const concept = await createConcept(cuenta.api, ['Costos variables', 'Licencias'], 'Mercado');
    await createExpense(cuenta.api, concept, 50000);
    await entrar();
  });

  test('is edited from its card and the table shows the new amount', async ({ page }) => {
    await movementRow(page, 'Mercado', '50.000')
      .getByRole('cell', { name: 'Mercado', exact: true })
      .click();
    const card = page.getByRole('dialog', { name: 'Editar movimiento' });
    await expect(card.getByText('$ 50.000')).toBeVisible();
    await expectAccessible(page, 'the movement card');

    await card.getByRole('button', { name: 'Editar movimiento' }).click();
    await card.getByRole('textbox', { name: 'Valor' }).fill('61000');
    await expectAccessible(page, 'the movement card, editing');
    await card.getByRole('button', { name: 'Guardar' }).click();

    await expect(movementRow(page, 'Mercado', '61.000')).toBeVisible();
    await expect(movementRow(page, 'Mercado', '50.000')).toHaveCount(0);
  });

  test('is deleted, and its concept stays in the cost centres', async ({ page }) => {
    await movementRow(page, 'Mercado', '50.000')
      .getByRole('cell', { name: 'Mercado', exact: true })
      .click();
    const card = page.getByRole('dialog', { name: 'Editar movimiento' });
    await card.getByRole('button', { name: 'Eliminar movimiento' }).click();

    // CLAUDE.md rule 15: the confirmation says the concept is NOT deleted.
    const confirm = page.getByRole('alertdialog');
    await expect(confirm).toContainText(/No se elimina el concepto .Mercado/);
    await expectAccessible(page, 'the delete confirmation');
    await confirm.getByRole('button', { name: 'Eliminar', exact: true }).click();

    await expect(movementRow(page, 'Mercado', '50.000')).toHaveCount(0);
    await page.goto('/cost-centers');
    await expect(page.getByRole('button', { name: /Mercado$/ })).toBeVisible();
  });
});
