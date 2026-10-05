import { test as base, expect, request, type APIRequestContext } from '@playwright/test';

import { BASE_URL } from './entorno.mjs';

/**
 * Every journey gets its OWN user: registered, approved by the admin and with
 * nothing in it. Journeys share no data, so they run in parallel and in any
 * order (§7.7: no test may depend on another one).
 *
 * Accounts live in the fake GoTrue of `servidor.mjs`; the password below is
 * only valid there.
 */

const ADMIN_EMAIL = 'admin@recorridos.coco';
export const PASSWORD = 'Xk9$Ronda-Verde!';

let counter = 0;

/** A unique e-mail per call, under a domain that says it is a test. */
function uniqueEmail(): string {
  counter += 1;
  return `persona-${process.pid}-${Date.now()}-${counter}@recorridos.coco`;
}

interface Envelope<T> {
  data: T;
}

async function readData<T>(response: Awaited<ReturnType<APIRequestContext['get']>>): Promise<T> {
  expect(response.ok(), `${response.url()} → ${response.status()}`).toBeTruthy();
  return ((await response.json()) as Envelope<T>).data;
}

async function login(email: string): Promise<APIRequestContext> {
  const anonymous = await request.newContext({ baseURL: BASE_URL });
  const { access_token } = await readData<{ access_token: string }>(
    await anonymous.post('/api/v1/auth/login', { data: { email, password: PASSWORD } }),
  );
  await anonymous.dispose();
  return request.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: { Authorization: `Bearer ${access_token}` },
  });
}

async function register(email: string, displayName: string): Promise<void> {
  const anonymous = await request.newContext({ baseURL: BASE_URL });
  const response = await anonymous.post('/api/v1/auth/register', {
    data: { email, password: PASSWORD, displayName },
  });
  await anonymous.dispose();
  // Another worker may have registered the admin first: that is fine.
  if (!response.ok() && !(email === ADMIN_EMAIL && response.status() === 409)) {
    throw new Error(`register ${email} → ${response.status()} ${await response.text()}`);
  }
}

interface Cuenta {
  email: string;
  displayName: string;
  /** The API, authenticated as this user. For seeding, never for asserting the UI. */
  api: APIRequestContext;
}

interface WorkerFixtures {
  admin: APIRequestContext;
}

interface TestFixtures {
  cuenta: Cuenta;
  /** Opens a session in the browser for `cuenta` and lands on the summary. */
  entrar: () => Promise<void>;
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  admin: [
    // eslint-disable-next-line no-empty-pattern -- Playwright reads a fixture's dependencies from this pattern; the admin has none.
    async ({}, use) => {
      await register(ADMIN_EMAIL, 'Administración');
      const admin = await login(ADMIN_EMAIL);
      await use(admin);
      await admin.dispose();
    },
    { scope: 'worker' },
  ],

  cuenta: async ({ admin }, use) => {
    const email = uniqueEmail();
    const displayName = 'Ana Prueba';
    await register(email, displayName);

    const pending = await readData<{ id: string | number; email: string }[]>(
      await admin.get('/api/v1/admin/users?status=pending&per_page=200'),
    );
    const user = pending.find((u) => u.email === email);
    if (!user) throw new Error(`${email} is not pending approval`);
    await readData(await admin.post(`/api/v1/admin/users/${String(user.id)}/approve`));

    const api = await login(email);
    await use({ email, displayName, api });
    await api.dispose();
  },

  entrar: async ({ page, cuenta }, use) => {
    await use(async () => {
      // Through the page's own request context, so the refresh cookie lands in
      // the browser exactly as a real login leaves it.
      const response = await page.request.post('/api/v1/auth/login', {
        data: { email: cuenta.email, password: PASSWORD },
      });
      expect(response.ok()).toBeTruthy();
      await page.goto('/');
    });
  },
});

export { expect } from '@playwright/test';
