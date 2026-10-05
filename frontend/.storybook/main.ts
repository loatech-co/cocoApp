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
  // `pseudo-states` paints :hover and :focus-visible without a mouse or a
  // keyboard, so a story can show the focus ring (rule 18) standing still.
  addons: ['@storybook/addon-themes', 'storybook-addon-pseudo-states'],
  framework: { name: '@storybook/react-vite', options: {} },
  core: { disableTelemetry: true },
};

export default config;
