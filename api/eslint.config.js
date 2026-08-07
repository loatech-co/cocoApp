// @ts-check
const js = require('@eslint/js');
const tseslint = require('typescript-eslint');
const prettier = require('eslint-config-prettier');

/**
 * Configuración plana de ESLint (v9).
 *
 * Las reglas con tipos (`recommendedTypeChecked`) son las que valen la pena en
 * este proyecto: detectan promesas sin `await`, comparaciones imposibles y usos
 * de `any` que se cuelan desde librerías. Sin información de tipos, ESLint solo
 * vería sintaxis.
 */
module.exports = tseslint.config(
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**', 'prisma/migrations/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
      },
      globals: {
        process: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        AbortSignal: 'readonly',
        __dirname: 'readonly',
        module: 'writable',
        require: 'readonly',
      },
    },
    rules: {
      // Un `_` delante marca "sé que no lo uso, está por la firma".
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Una promesa sin await en una ruta de escritura pierde errores en
      // silencio. En una app de finanzas eso es inaceptable.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
    },
  },
  {
    // Las pruebas usan `expect(...)` con formas dinámicas y acceden a cuerpos
    // de respuesta sin tipar; exigir tipos estrictos ahí solo produce ruido.
    files: ['test/**/*.ts', 'src/**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
    },
  },
  prettier,
);
