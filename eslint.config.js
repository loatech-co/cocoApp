// @ts-check
/**
 * The ONE ESLint config of the monorepo (ESLint 10, flat config). Phase 7.5.
 *
 * Every workspace inherits the shared layers below and only adds what its
 * environment needs: Node + Jest for `api`, the browser + React for `frontend`,
 * nothing for the two packages (their code runs in both places, so it must not
 * touch any global of either).
 *
 * - `typescript-eslint` strict-type-checked + stylistic-type-checked: the rules
 *   with type information are why this repo uses ESLint and not Biome
 *   (`no-floating-promises`, `no-unsafe-*`). See docs/plan-completo.md §7.5.
 * - `@eslint-react` instead of `eslint-plugin-react` (D6/D15: the latter does
 *   not support ESLint 10), plus `react-hooks` with its full recommended set.
 * - `import-x`: import order and no default exports (except where a framework
 *   needs one). Cycles are dependency-cruiser's job (later step).
 * - `eslint-config-prettier` last: Prettier formats, ESLint has no opinion.
 *
 * Every rule written here has its section in CONTRIBUTING.md.
 */
import js from '@eslint/js';
import eslintReact from '@eslint-react/eslint-plugin';
import prettier from 'eslint-config-prettier/flat';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
import { importX } from 'eslint-plugin-import-x';
import reactHooks from 'eslint-plugin-react-hooks';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores([
    '**/dist/**',
    '**/coverage/**',
    '**/node_modules/**',
    'frontend/public/**',
    'api/prisma/migrations/**',
    'api/prisma/migraciones-mysql-archivadas/**',
    'ios/**',
    'respaldos/**',
    'datos/**',
    // Operational one-off scripts: plain .mjs outside every tsconfig. Out of
    // the lint scope of the workspaces.
    'scripts/**',
  ]),

  // ── Shared by every workspace ────────────────────────────────────────────
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  importX.flatConfigs.typescript,
  {
    languageOptions: {
      parserOptions: {
        // Each file is checked against the nearest tsconfig.json.
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    settings: {
      // Resolves `@/…` and `@coco/…` through each workspace's tsconfig paths.
      'import-x/resolver-next': [
        createTypeScriptImportResolver({
          project: ['api/tsconfig.json', 'frontend/tsconfig.json', 'packages/*/tsconfig.json'],
        }),
      ],
      'import-x/internal-regex': '^(@/|@coco/)',
    },
    rules: {
      // A leading `_` marks "I know it is unused, it is there for the signature".
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // Numbers in a template literal are the normal way to build a message;
      // the rule still rejects objects, nullish and `any`.
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      // In this codebase `||` on a string is deliberate: '' means "not given"
      // (`texto?.trim() || null`). Every other primitive still needs `??`.
      '@typescript-eslint/prefer-nullish-coalescing': [
        'error',
        { ignorePrimitives: { string: true } },
      ],
      // `onClick={() => setOpen(false)}` is the idiomatic React handler; the
      // rule still rejects a void call used as a value anywhere else.
      '@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }],

      // Import order: packages, then internal aliases, then relative paths.
      'import-x/order': [
        'error',
        {
          groups: [['builtin', 'external'], 'internal', ['parent', 'sibling', 'index']],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'import-x/first': 'error',
      'import-x/no-duplicates': 'error',
      'import-x/newline-after-import': 'error',
      'import-x/no-default-export': 'error',
      // Resolution is TypeScript's job (typecheck), and the resolver would
      // need a plugin of its own just to repeat it.
      'import-x/no-unresolved': 'off',
    },
  },
  {
    // Plain JS config files are outside every tsconfig: no type information.
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },
  {
    // Tools that load their config through a default export.
    files: ['eslint.config.js', '*.config.{js,ts,mjs}', 'frontend/*.config.ts'],
    rules: { 'import-x/no-default-export': 'off' },
  },

  // ── api: Node + NestJS + Jest ─────────────────────────────────────────────
  {
    files: ['api/**/*.ts'],
    languageOptions: { globals: globals.node },
    rules: {
      // NestJS modules are classes with only decorators; that is the framework.
      '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],
    },
  },
  {
    files: ['api/test/**/*.ts', 'api/src/**/*.spec.ts'],
    languageOptions: { globals: globals.jest },
  },

  // ── frontend: browser + React ─────────────────────────────────────────────
  {
    files: ['frontend/**/*.{ts,tsx}'],
    extends: [
      eslintReact.configs['recommended-type-checked'],
      // Naming (refs ending in `Ref`, setters named `setX`…) is step 7.2's
      // job, together with `naming-convention` and `check-file`: renames land
      // there, in one place, with the rename map.
      eslintReact.configs['disable-naming-convention'],
      reactHooks.configs.flat['recommended-latest'],
    ],
    languageOptions: { globals: globals.browser },
    rules: {
      // The hook rules come from `react-hooks` (the React team's, with the
      // compiler checks this repo already cleaned). @eslint-react ships its
      // own copies under the same names; one source per check, so these
      // duplicates are off. The checks themselves stay on, as react-hooks/*.
      '@eslint-react/error-boundaries': 'off',
      '@eslint-react/exhaustive-deps': 'off',
      '@eslint-react/purity': 'off',
      '@eslint-react/rules-of-hooks': 'off',
      '@eslint-react/set-state-in-effect': 'off',
      '@eslint-react/set-state-in-render': 'off',
      '@eslint-react/static-components': 'off',
      '@eslint-react/unsupported-syntax': 'off',
      '@eslint-react/use-memo': 'off',
      // Setter names are naming, which is step 7.2 (see above).
      '@eslint-react/use-state': ['warn', { enforceSetterName: false }],
    },
  },
  {
    // Vite and Vitest configs run in Node.
    files: ['frontend/*.config.ts'],
    languageOptions: { globals: globals.node },
  },

  // ── Tests, every workspace ────────────────────────────────────────────────
  {
    // A test handles dynamic shapes on purpose (mocked responses, `expect` on
    // untyped bodies); strict types there produce noise, not safety. This is
    // the same exception both workspaces already had before 7.5.
    files: [
      'api/test/**/*.ts',
      'api/src/**/*.spec.ts',
      'frontend/src/**/*.test.{ts,tsx}',
      'frontend/src/pruebas/**',
    ],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      // `querySelector(...)!` in a test IS the assertion: if the element is
      // missing the test fails right there, which is what it should do.
      '@typescript-eslint/no-non-null-assertion': 'off',
      // Stubs of browser APIs (`observe() {}`, `addEventListener: () => {}`)
      // are empty on purpose.
      '@typescript-eslint/no-empty-function': 'off',
    },
  },

  prettier,
);
