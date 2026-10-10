import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Component tests need a DOM; the parsers and the pure logic do not —and run
 * much faster without it—. That is why the environment is not set globally
 * here: every file that needs it asks for it with the
 * `@vitest-environment jsdom` annotation on its first line.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    // What jsdom does not bring. It loads in EVERY file, also in those that
    // run without a DOM: the file itself checks whether there is a window
    // before touching anything, which is cheaper than keeping a list here.
    setupFiles: ['./src/test-support/setup.ts'],
    // Plan 7.7: 70 % of lines and branches in `frontend/src`. The thresholds
    // only go up: a PR that lowers them needs a written reason in its ADR.
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/*.stories.tsx',
        'src/test-support/**',
        'src/**/*.d.ts',
        // Written by Orval from the v2 contract (D11), not by us: measuring it
        // would grade the generator, and every endpoint the web does not call
        // yet would count as untested code.
        'src/shared/api/generated/**',
      ],
      reporter: ['text-summary', 'json-summary'],
      // Measured when the gate was set (step 7.7-web-b): 55.36 % lines and
      // 49.63 % branches overall; 98.25 / 96.11 in `shared/ui`. Raised in step
      // 7.7-web-c, with every `features/*/model` covered: 60.82 / 57.64. The
      // gap to the plan's 70 % is in the components and hooks of `features/`
      // (see CONTRIBUTING, "Frontend coverage"). Raised in step J-2 to the
      // plan's 70 % lines, measured at 72.05 % lines and 68.24 % branches.
      thresholds: {
        lines: 70,
        branches: 66,
        'src/shared/ui/**': { lines: 98, branches: 96 },
      },
    },
  },
});
