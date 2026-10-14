import { test, type Locator, type Page } from '@playwright/test';

/**
 * The few gestures that differ between the phone and the desktop, written
 * once. The journeys say WHAT they do; these say where the button is.
 */

function onPhone(): boolean {
  return test.info().project.name === 'mobile';
}

/** Opens the "new expense" sheet: the round button of the bottom bar, or the menu. */
export async function openNewExpense(page: Page): Promise<Locator> {
  if (onPhone()) {
    await page.getByRole('button', { name: 'Registrar un gasto' }).click();
  } else {
    await page.getByRole('button', { name: 'Nuevo movimiento' }).click();
    await page.getByRole('menuitem', { name: /Gasto/ }).click();
  }
  const sheet = page.getByRole('dialog', { name: 'Nuevo movimiento' });
  await sheet.getByRole('heading', { name: 'Nuevo gasto' }).waitFor();
  return sheet;
}

/**
 * Opens the "new expense" sheet to type it: on the phone the fields wait
 * behind «Registrar manualmente», next to the three receipt sources.
 */
export async function openNewExpenseByHand(page: Page): Promise<Locator> {
  const sheet = await openNewExpense(page);
  if (onPhone()) await sheet.getByRole('button', { name: 'Registrar manualmente' }).click();
  return sheet;
}

/** Picks a concept in the sheet's concept finder, by what is typed. */
export async function pickConcept(sheet: Locator, typed: string, option: RegExp): Promise<void> {
  await sheet.getByRole('button', { name: 'Concepto' }).click();
  await sheet.getByRole('textbox', { name: 'Buscar concepto o categoría' }).fill(typed);
  await sheet
    .getByRole('listbox', { name: 'Resultados' })
    .getByRole('option', { name: option })
    .click();
}

/** The account panel: the avatar of the bottom bar, or the user button of the rail. */
export async function openAccountPanel(page: Page, email: string): Promise<void> {
  if (onPhone()) {
    await page.getByRole('button', { name: 'Mi cuenta' }).click();
  } else {
    await page.getByRole('button', { name: new RegExp(email.replace(/[.+]/g, '\\$&')) }).click();
  }
}

/**
 * The movement's row in the table, by its concept and its amount. On the
 * phone the table is a list of rows that unfold: the row is its list item,
 * found by the toggle that shows the concept.
 */
export function movementRow(page: Page, concept: string, amount: string): Locator {
  if (onPhone()) {
    return page
      .getByRole('listitem')
      .filter({ has: page.getByRole('button', { name: new RegExp(`^${concept}\\b`) }) })
      .filter({ hasText: amount });
  }
  return page
    .getByRole('row')
    .filter({ has: page.getByRole('cell', { name: concept, exact: true }) })
    .filter({ hasText: amount });
}

/**
 * Opens the movement's sheet from its row: a tap on the row on the desktop;
 * on the phone, unfold the row and press «Ver movimiento».
 */
export async function openMovement(page: Page, concept: string, amount: string): Promise<void> {
  const row = movementRow(page, concept, amount);
  if (onPhone()) {
    await row.getByRole('button', { expanded: false }).click();
    await row.getByRole('button', { name: 'Ver movimiento' }).click();
    return;
  }
  await row.getByRole('cell', { name: concept, exact: true }).click();
}

/** "Cerrar sesión" in the account panel: a menu item on the desktop, a button on the phone. */
export function signOutButton(page: Page): Locator {
  return page.getByRole(onPhone() ? 'button' : 'menuitem', { name: 'Cerrar sesión' });
}

/** The "Acciones de …" menu of a centre or category: a sheet on the phone, a menu on the desktop. */
export function actionsMenu(page: Page, of: string): Locator {
  return page.getByRole(onPhone() ? 'dialog' : 'menu', { name: `Acciones de ${of}` });
}
