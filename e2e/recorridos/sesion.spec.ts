import { openAccountPanel, signOutButton } from '../support/app';
import { expectAccessible } from '../support/axe';
import { expect, PASSWORD, test } from '../support/fixtures';

test.describe('session', () => {
  test('signs in with e-mail and password and lands on the summary', async ({ page, cuenta }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '¡Hola de nuevo!' })).toBeVisible();
    await expectAccessible(page, 'the sign-in screen');

    await page.getByRole('textbox', { name: 'Correo' }).fill(cuenta.email);
    await page.getByRole('textbox', { name: 'Contraseña' }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();

    await expect(page.getByRole('heading', { level: 1, name: /Hola de nuevo, Ana/ })).toBeVisible();
    await expectAccessible(page, 'the summary');
  });

  test('rejects a wrong password without signing in', async ({ page, cuenta }) => {
    await page.goto('/');
    await page.getByRole('textbox', { name: 'Correo' }).fill(cuenta.email);
    await page.getByRole('textbox', { name: 'Contraseña' }).fill('Otra-clave-equivocada-9!');
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();

    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Iniciar sesión' })).toBeVisible();
    await expectAccessible(page, 'the sign-in error');
  });

  test('signs out and a reload does not bring the session back', async ({
    page,
    cuenta,
    entrar,
  }) => {
    await entrar();
    await expect(page.getByRole('heading', { level: 1, name: /Hola de nuevo/ })).toBeVisible();

    await openAccountPanel(page, cuenta.email);
    await expectAccessible(page, 'the account panel');
    await signOutButton(page).click();

    await expect(page.getByRole('button', { name: 'Iniciar sesión' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Iniciar sesión' })).toBeVisible();
  });
});
