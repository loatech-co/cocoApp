import type { StorybookConfig } from '@storybook/react-vite';

/**
 * The component catalogue: every `shared/ui` component with its variants and
 * states, grouped by atomic level (Atoms, Molecules, Organisms, Templates).
 *
 * The Vite builder reuses `frontend/vite.config.ts`, so the `@/` aliases and
 * the Tailwind plugin are the app's own. Stories never fetch: no React Query,
 * no api-client — the build must work offline and without data.
 */
const config: StorybookConfig = {
  stories: ['../src/shared/ui/**/*.stories.tsx'],
  addons: ['@storybook/addon-themes'],
  framework: { name: '@storybook/react-vite', options: {} },
  core: { disableTelemetry: true },
};

export default config;
