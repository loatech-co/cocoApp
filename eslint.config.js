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
 *   needs one). Cycles and layering are dependency-cruiser's job
 *   (`.dependency-cruiser.cjs`, step 7.4).
 * - Size limits (step 7.4): 300 lines per file, 50 per function, blank lines
 *   and comments not counted. The API complies; the web and the packages
 *   list their current offenders below until the frontend step splits them.
 * - `eslint-config-prettier` last: Prettier formats, ESLint has no opinion.
 *
 * Every rule written here has its section in CONTRIBUTING.md.
 */
import js from '@eslint/js';
import eslintReact from '@eslint-react/eslint-plugin';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier/flat';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
import { importX } from 'eslint-plugin-import-x';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// ── Design: use what shared/ui already has (step 7.4-web-c) ─────────────────
/*
 * Rigid in the pieces, flexible in the composition. Outside `shared/ui` a
 * screen composes components: it does not draw its own controls nor invent
 * measures. Two rules, both for `frontend/src` outside `shared/ui`:
 *
 * - `coco/no-raw-elements`: the HTML elements that already have a component.
 * - `coco/no-arbitrary-values`: Tailwind arbitrary values that are a colour
 *   (`bg-[#…]`), a radius (`rounded-[…]`) or a measure (`w-[…]`,
 *   `text-[13px]`). A `var(--token)` is not arbitrary: it reads the theme.
 *
 * A new need goes, in this order: combine what exists → add a variant to the
 * component → create a component at the lowest level, with its story. Never a
 * class from the call. CONTRIBUTING.md («Rigid pieces») has the why.
 */
const RAW_ELEMENTS = {
  button: 'Button, or the shared/ui atom that draws that kind of control',
  input: 'Input, SearchBox, Casilla, Interruptor or FilePicker (shared/ui/atoms)',
  textarea: 'Textarea (shared/ui/atoms/textarea)',
  select: 'Select (shared/ui/organisms/select)',
  dialog: 'Modal or Confirmacion (shared/ui/organisms)',
  table: 'Tabla (shared/ui/molecules/tabla)',
};

/** `utility-[value]`, with any variant prefix (`movil:`, `hover:`) before it. */
const ARBITRARY = /(?<![\w[-])(?:[\w-]+:)*-?([a-z]+(?:-[a-z]+)*)-\[([^\]\s'"`]+)\]/g;
const RADIUS = /^rounded(?:-[a-z]{1,2})?$/;
const COLOUR = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch|color-mix)\(/i;
const MEASURE =
  /^(?:w|h|size|min-w|min-h|max-w|max-h|basis|[pm][xytrbl]?|gap(?:-[xy])?|inset(?:-[xy])?|top|left|right|bottom|text|leading|tracking|translate-[xy]|space-[xy]|border(?:-[xytrbl])?|indent)$/;

/**
 * THE list of exceptions to the two rules above: a use that is not here does
 * not exist. Each entry names the file (from `frontend/src/`), the exact use
 * (the element, or the class as written) and why it cannot be a component or
 * a theme value. An entry is a decision, not a convenience.
 */
const DESIGN_EXCEPTIONS = [
  {
    file: 'features/transactions/components/selector-de-fecha.tsx',
    use: 'input',
    why: 'type="hidden": carries the chosen day to a native <form>. Nothing is drawn, so there is no component to use.',
  },
];

function exceptionsOf(filename) {
  const relative = filename.split('/frontend/src/')[1];
  return DESIGN_EXCEPTIONS.filter((e) => e.file === relative);
}

/**
 * An exception nobody uses any more is reported too: it would let the next
 * raw element or arbitrary class into that file in silence.
 */
function reportStale(context, exceptions, used) {
  for (const e of exceptions) {
    if (used.has(e.use)) continue;
    context.report({
      loc: { line: 1, column: 0 },
      message: `DESIGN_EXCEPTIONS lists \`${e.use}\` for this file and it is no longer used: remove the entry.`,
    });
  }
}

function arbitraryUses(text) {
  const found = [];
  for (const [token, utility, value] of text.matchAll(ARBITRARY)) {
    if (value.startsWith('var(')) continue;
    // The touch floor (`movil:min-h-[42px]`) has its own registry with its
    // reasons: `shared/ui/piso-tactil.test.ts`, which also rejects any floor
    // under 42. One place per rule, not two.
    if (token.startsWith('movil:min-')) continue;
    if (RADIUS.test(utility)) found.push({ token, kind: 'radius' });
    else if (COLOUR.test(value)) found.push({ token, kind: 'colour' });
    else if (MEASURE.test(utility) && /\d/.test(value)) found.push({ token, kind: 'measure' });
  }
  return found;
}

const cocoDesign = {
  rules: {
    'no-raw-elements': {
      meta: { type: 'problem', schema: [] },
      create(context) {
        const exceptions = exceptionsOf(context.filename).filter((e) => e.use in RAW_ELEMENTS);
        const used = new Set();
        return {
          'Program:exit'() {
            reportStale(context, exceptions, used);
          },
          JSXOpeningElement(node) {
            const name = node.name.type === 'JSXIdentifier' ? node.name.name : '';
            if (!(name in RAW_ELEMENTS)) return;
            if (exceptions.some((e) => e.use === name)) {
              used.add(name);
              return;
            }
            context.report({
              node,
              message: `<${name}> outside shared/ui: use ${RAW_ELEMENTS[name]}. A new need is a variant of the component (exceptions: DESIGN_EXCEPTIONS in eslint.config.js).`,
            });
          },
        };
      },
    },
    'no-arbitrary-values': {
      meta: { type: 'problem', schema: [] },
      create(context) {
        const exceptions = exceptionsOf(context.filename).filter((e) => !(e.use in RAW_ELEMENTS));
        const used = new Set();
        function check(node, text) {
          for (const { token, kind } of arbitraryUses(text)) {
            if (exceptions.some((e) => e.use === token)) {
              used.add(token);
              continue;
            }
            context.report({
              node,
              message: `Arbitrary ${kind} \`${token}\` outside shared/ui: use the theme scale or a variant of the component (exceptions: DESIGN_EXCEPTIONS in eslint.config.js).`,
            });
          }
        }
        return {
          'Program:exit'() {
            reportStale(context, exceptions, used);
          },
          Literal(node) {
            if (typeof node.value === 'string') check(node, node.value);
          },
          TemplateElement(node) {
            check(node, node.value.raw);
          },
        };
      },
    },
  },
};

export default defineConfig(
  globalIgnores([
    '**/dist/**',
    '**/storybook-static/**',
    '.claude/worktrees/**',
    '**/coverage/**',
    '**/node_modules/**',
    'frontend/public/**',
    'api/prisma/migrations/**',
    'api/prisma/migraciones-mysql-archivadas/**',
    'ios/**',
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
    files: [
      'eslint.config.js',
      '*.config.{js,ts,mjs}',
      'frontend/*.config.ts',
      'e2e/*.config.ts',
      // Storybook reads its config and each story file's meta the same way.
      'frontend/.storybook/*.{ts,tsx}',
      'frontend/src/**/*.stories.tsx',
    ],
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
    files: ['api/test/**/*.ts', 'api/src/**/*.spec.ts', 'packages/*/src/**/*.spec.ts'],
    languageOptions: { globals: globals.jest },
  },
  {
    // Services, controllers, repositories and tasks speak the domain: they
    // throw a DomainError (common/errors), and the exceptions filter is the
    // only place that turns it into HTTP. Guards, pipes and param decorators
    // are the HTTP adapter and keep Nest's exceptions.
    files: ['api/src/**/*.{service,controller,repository,task}.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'NewExpression[callee.name=/Exception$/]',
          message:
            'Throw a DomainError from common/errors/domain-error.ts; the exceptions filter maps it to HTTP.',
        },
      ],
    },
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
    // See «Design» at the top. Tests render raw elements on purpose (a form
    // with a native submit to drive a component), so they are out.
    files: ['frontend/src/**/*.{ts,tsx}'],
    ignores: [
      'frontend/src/shared/ui/**',
      'frontend/src/**/*.test.{ts,tsx}',
      'frontend/src/pruebas/**',
    ],
    plugins: { coco: cocoDesign },
    rules: {
      'coco/no-raw-elements': 'error',
      'coco/no-arbitrary-values': 'error',
    },
  },
  {
    // Vite and Vitest configs run in Node.
    files: ['frontend/*.config.ts'],
    languageOptions: { globals: globals.node },
  },

  // ── Size limits (step 7.4) ────────────────────────────────────────────────
  {
    files: ['api/src/**/*.ts', 'frontend/src/**/*.{ts,tsx}', 'packages/*/src/**/*.ts'],
    rules: {
      'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['error', { max: 50, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    // A test file is a list of `describe`/`it` callbacks: the callback IS the
    // function, and cutting it to 50 lines only scatters one scenario. Tests
    // still have the 300-line file limit.
    files: [
      'api/src/**/*.spec.ts',
      'packages/*/src/**/*.spec.ts',
      'frontend/src/**/*.test.{ts,tsx}',
      'frontend/src/pruebas/**',
    ],
    rules: { 'max-lines-per-function': 'off' },
  },
  {
    // TEMPORARY: the files that were over 300 lines when the limit arrived
    // (step 7.4). The frontend ones were split in 7.4-web-b and 7.4-web-b2;
    // these two are packages, outside the web steps. A file never gets added
    // to it.
    files: ['packages/lectura/src/diccionario.ts'],
    rules: { 'max-lines': 'off' },
  },
  {
    // TEMPORARY: the files with a function over 50 lines when the limit
    // arrived (step 7.4). The frontend ones were split in 7.4-web-b3; this one
    // is a package, outside the web steps. Same rule as the list above.
    files: ['packages/lectura/src/clasificar.ts'],
    rules: { 'max-lines-per-function': 'off' },
  },

  // ── Tests, every workspace ────────────────────────────────────────────────
  {
    // A test handles dynamic shapes on purpose (mocked responses, `expect` on
    // untyped bodies); strict types there produce noise, not safety. This is
    // the same exception both workspaces already had before 7.5.
    files: [
      'api/test/**/*.ts',
      'api/src/**/*.spec.ts',
      'packages/*/src/**/*.spec.ts',
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
