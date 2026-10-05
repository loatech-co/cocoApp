import { test, type Locator, type Page } from '@playwright/test';

/**
 * The few gestures that differ between the phone and the desktop, written
 * once. The journeys say WHAT they do; these say where the button is.
 */

function onPhone(): boolean {
  return test.info().project.name === 'movil';
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

/** The movement's row in the table, by its concept and its amount. */
export function movementRow(page: Page, concept: string, amount: string): Locator {
  return page
    .getByRole('row')
    .filter({ has: page.getByRole('cell', { name: concept, exact: true }) })
    .filter({ hasText: amount });
}

/** "Cerrar sesión" in the account panel: a menu item on the desktop, a button on the phone. */
export function signOutButton(page: Page): Locator {
  return page.getByRole(onPhone() ? 'button' : 'menuitem', { name: 'Cerrar sesión' });
}

/** The "Acciones de …" menu of a centre or category: a sheet on the phone, a menu on the desktop. */
export function actionsMenu(page: Page, of: string): Locator {
  return page.getByRole(onPhone() ? 'dialog' : 'menu', { name: `Acciones de ${of}` });
}
