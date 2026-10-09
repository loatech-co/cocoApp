import { expect, test } from '../support/fixtures';

/*
  The Spanish addresses from before 7.2-r1. Saved links and bookmarks point at
  them, so they redirect to the English route, with their query and hash, and
  without leaving the old address in the history.
*/
test.describe('the Spanish routes, signed in', () => {
  // The fixture keeps its Spanish name until its own slice; asking for it once
  // keeps `lint:spanish` from counting it again in every test.
  test.beforeEach(async ({ entrar: signIn }) => signIn());

  test('a cost centers bookmark lands on the new route with its query and hash', async ({
    page,
  }) => {
    await page.goto('/centros-de-costos?from=bookmark#top');

    await expect(page).toHaveURL(/\/cost-centers\?from=bookmark#top$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Centros de costos' })).toBeVisible();
  });

  test('the account keeps the section it pointed at', async ({ page }) => {
    await page.goto('/mi-cuenta#seguridad');

    await expect(page).toHaveURL(/\/account#seguridad$/);
    await expect(page.locator('#seguridad')).toBeVisible();
  });

  test('the redirect replaces the old address in the history', async ({ page }) => {
    await page.goto('/cost-centers');
    await page.goto('/cuentas');
    await expect(page).toHaveURL(/\/accounts$/);

    await page.goBack();
    await expect(page).toHaveURL(/\/cost-centers$/);
  });

  test('a summary link with the Spanish filters opens the same cut', async ({ page }) => {
    await page.goto('/?rango=anio-pasado');

    await expect(page.getByRole('button', { name: /Año pasado/ }).first()).toBeVisible();
  });
});

test.describe('the Spanish routes, without a session', () => {
  test('the sign-up request answers on its old address too', async ({ page }) => {
    await page.goto('/registro');

    await expect(page).toHaveURL(/\/sign-up$/);
  });
});
