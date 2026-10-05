// @ts-check
const js = require('@eslint/js');
const tseslint = require('typescript-eslint');
const prettier = require('eslint-config-prettier');

/**
 * Configuración plana de ESLint (v9) para este paquete compartido.
 *
 * Es el espejo de la de `api/eslint.config.js`: las mismas tres capas
 * —`js.recommended`, `recommendedTypeChecked` y `prettier`— y las mismas tres
 * reglas propias. Dos configuraciones parecidas pero distintas son peores que
 * una sola: el mismo error se señala en un workspace y pasa en otro.
 *
 * Va en CommonJS porque el `package.json` no declara `"type": "module"` (igual
 * que la API). Y las reglas con tipos leen el `tsconfig.json` del paquete a
 * través de `projectService`, que es lo que hace que detecten promesas sin
 * `await` y comparaciones imposibles, no solo sintaxis.
 *
 * Aquí no hay Node ni navegador: el código corre en los dos sitios y no debe
 * tocar ningún global de ninguno, así que no se declara ninguno a propósito.
 */
module.exports = tseslint.config(
  {
    // El propio `eslint.config.js` se excluye: es un `.js` fuera del
    // `tsconfig` y el servicio de tipos no sabría analizarlo.
    ignores: ['dist/**', 'node_modules/**', 'eslint.config.js'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      // Un `_` delante marca "sé que no lo uso, está por la firma".
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
    },
  },
  prettier,
);
