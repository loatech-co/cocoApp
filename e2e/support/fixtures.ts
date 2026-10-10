import { test as base, expect, type APIRequestContext } from '@playwright/test';

import { ADMIN_EMAIL, login, PASSWORD, readData, register } from './accounts';

/**
 * Every journey gets its OWN user: registered, approved by the admin and with
 * nothing in it. Journeys share no data, so they run in parallel and in any
 * order (§7.7: no test may depend on another one).
 */

let counter = 0;

/** A unique e-mail per call, under a domain that says it is a test. */
function uniqueEmail(): string {
  counter += 1;
  return `persona-${process.pid}-${Date.now()}-${counter}@journeys.coco`;
}

interface Account {
  email: string;
  displayName: string;
  /** The API, authenticated as this user. For seeding, never for asserting the UI. */
  api: APIRequestContext;
}

interface WorkerFixtures {
  admin: APIRequestContext;
}

interface TestFixtures {
  account: Account;
  /** Opens a session in the browser for `account` and lands on the summary. */
  signIn: () => Promise<void>;
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  admin: [
    // The admin is registered ONCE, in `global-setup.ts`, before any worker
    // starts: registered here, two workers raced and one logged in before the
    // other had created its profile, which is a 403 `account_not_enabled`.
    // eslint-disable-next-line no-empty-pattern -- Playwright reads a fixture's dependencies from this pattern; the admin has none.
    async ({}, use) => {
      const admin = await login(ADMIN_EMAIL);
      await use(admin);
      await admin.dispose();
    },
    { scope: 'worker' },
  ],

  account: async ({ admin }, use) => {
    const email = uniqueEmail();
    const displayName = 'Ana Prueba';
    await register(email, displayName);

    const pending = await readData<{ id: string | number; email: string }[]>(
      await admin.get('/api/v2/admin/users?status=pending&perPage=200'),
    );
    const user = pending.find((u) => u.email === email);
    if (!user) throw new Error(`${email} is not pending approval`);
    await readData(await admin.post(`/api/v2/admin/users/${String(user.id)}/approve`));

    const api = await login(email);
    await use({ email, displayName, api });
    await api.dispose();
  },

  signIn: async ({ page, account }, use) => {
    await use(async () => {
      // Through the page's own request context, so the refresh cookie lands in
      // the browser exactly as a real login leaves it.
      const response = await page.request.post('/api/v2/auth/login', {
        data: { email: account.email, password: PASSWORD },
      });
      expect(response.ok()).toBeTruthy();
      await page.goto('/');
    });
  },
});

export { expect } from '@playwright/test';
