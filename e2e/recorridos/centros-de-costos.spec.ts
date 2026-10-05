import { actionsMenu, movementRow } from '../support/app';
import { expectAccessible } from '../support/axe';
import { expect, test } from '../support/fixtures';
import { createConcept, createExpense } from '../support/semilla';

test.describe('cost centres', () => {
  test('builds a centre, a category and a concept', async ({ page, entrar }) => {
    await entrar();
    await page.goto('/centros-de-costos');
    await expect(page.getByRole('heading', { level: 1, name: 'Centros de costos' })).toBeVisible();
    await expectAccessible(page, 'the cost centres');

    await page.getByRole('button', { name: 'Nuevo centro de costos' }).click();
    const centre = page.getByRole('dialog', { name: 'Nuevo centro de costos' });
    await centre.getByRole('textbox', { name: 'Nombre' }).fill('Negocio');
    await expectAccessible(page, 'the new-centre card');
    await centre.getByRole('button', { name: 'Crear' }).click();
    await expect(page.getByRole('button', { name: /^Negocio/ })).toBeVisible();

    // The innermost block holding both the centre and an "add category" is the centre's card.
    const centreCard = page
      .locator('div')
      .filter({ has: page.getByRole('button', { name: /^Negocio/ }) })
      .filter({ has: page.getByRole('button', { name: 'Agregar categoría' }) })
      .last();
    await centreCard.getByRole('button', { name: 'Agregar categoría' }).click();
    const category = page.getByRole('dialog', { name: 'Nueva categoría' });
    await category.getByRole('textbox', { name: 'Nombre' }).fill('Oficina');
    await category.getByRole('button', { name: 'Crear' }).click();
    await expect(page.getByRole('heading', { level: 3, name: 'Oficina' })).toBeVisible();

    await page.getByRole('button', { name: 'Acciones de Oficina' }).click();
    await actionsMenu(page, 'Oficina').getByRole('menuitem', { name: 'Agregar concepto' }).click();
    const concept = page.getByRole('dialog', { name: 'Nuevo concepto' });
    await concept.getByRole('textbox', { name: 'Nombre' }).fill('Papelería');
    await concept.getByRole('button', { name: /Crear|Guardar/ }).click();

    await expect(page.getByRole('button', { name: /Papelería$/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Negocio/ })).toContainText(
      '1 categoría(s) · 1 concepto(s)',
    );
  });

  test('renaming a concept renames its movements too', async ({ page, cuenta, entrar }) => {
    const concept = await createConcept(cuenta.api, ['Costos variables', 'Licencias'], 'Aseo');
    await createExpense(cuenta.api, concept, 27_000);
    await entrar();
    await expect(movementRow(page, 'Aseo', '27.000')).toBeVisible();

    await page.goto('/centros-de-costos');
    await page.getByRole('button', { name: /Aseo$/ }).click();
    const card = page.getByRole('dialog', { name: 'Editar concepto' });
    await card.getByRole('textbox', { name: 'Nombre' }).fill('Aseo y limpieza');
    await card.getByRole('button', { name: 'Guardar' }).click();
    await expect(card).toBeHidden();

    // CLAUDE.md rule 15: a movement takes its name from its concept.
    await page.goto('/');
    await expect(movementRow(page, 'Aseo y limpieza', '27.000')).toBeVisible();
  });
});
