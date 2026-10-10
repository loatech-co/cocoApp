import { defineConfig, devices } from '@playwright/test';

import { API_PORT, BASE_URL } from './support/environment.mjs';

/**
 * The critical journeys of the web (plan §7.7), each with an axe check (D16).
 *
 * One server for the whole run (`support/server.mjs`): the API, compiled and
 * unchanged, serving the built SPA, against its own `coco_e2e_pw_test` database
 * and a local fake of Supabase Auth. Every test registers its OWN user, so the
 * journeys share nothing and run in parallel. `npm run e2e` from the root.
 */
export default defineConfig({
  testDir: './journeys',
  // Registers the admin once, after the server is up and before any worker.
  globalSetup: './support/global-setup.ts',
  outputDir: './.output/results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI
    ? [['list'], ['html', { outputFolder: './.output/report', open: 'never' }]]
    : [['list']],
  use: {
    baseURL: BASE_URL,
    locale: 'es-CO',
    timezoneId: 'America/Bogota',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    // The iPhone viewport, touch and user agent, rendered by Chromium: the
    // plan asks for Chromium on both, and WebKit would be a third install.
    { name: 'mobile', use: { ...devices['iPhone 15'], browserName: 'chromium' } },
  ],
  webServer: {
    command: 'node support/server.mjs',
    url: `http://localhost:${API_PORT}/api/v2/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { PRISMA_HIDE_UPDATE_MESSAGE: '1' },
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
