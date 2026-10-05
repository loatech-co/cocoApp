// @ts-check
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

/**
 * Configuración plana de ESLint (v9) para el frontend.
 *
 * ── Por qué existe este archivo ─────────────────────────────────────────────
 * No existía. `package.json` declaraba el script y `eslint` estaba instalado,
 * pero sin configuración el comando abortaba con «couldn't find an
 * eslint.config file» — así que el frontend entero nunca había pasado por
 * lint, y nadie se enteraba porque el error parecía de arranque y no de
 * calidad.
 *
 * ── Es el espejo del de la API ──────────────────────────────────────────────
 * Las mismas tres capas —`js.recommended`, `recommendedTypeChecked` y
 * `prettier`— y las mismas tres reglas propias. Dos configuraciones que se
 * parecen pero no coinciden son peores que una sola: el mismo error se señala
 * en un lado y pasa en el otro, y nadie sabe cuál de las dos es la buena.
 *
 * Lo que cambia es lo que TIENE que cambiar: aquí hay JSX y navegador, allá
 * decoradores y Node.
 *
 * ── Y `react-hooks` ─────────────────────────────────────────────────────────
 * Se añade porque el código ya lo daba por supuesto: hay dos
 * `eslint-disable-next-line react-hooks/exhaustive-deps` escritos a mano en
 * `components/soportes.tsx`. Un `disable` de una regla que no existe no
 * desactiva nada: es un comentario que promete una verificación que nunca
 * ocurrió.
 */
export default tseslint.config(
  {
    // `eslint.config.js` se excluye a sí mismo: es un `.js` y el proyecto no
    // tiene `allowJs`, así que el servicio de tipos no lo reconoce y las
    // reglas con tipos no pueden analizarlo.
    ignores: ['dist/**', 'coverage/**', 'node_modules/**', 'public/**', 'eslint.config.js'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        // El navegador. No se usa `globals` como paquete para no añadir una
        // dependencia por una lista que aquí cabe entera.
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        fetch: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        queueMicrotask: 'readonly',
        structuredClone: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        Blob: 'readonly',
        File: 'readonly',
        FileReader: 'readonly',
        FormData: 'readonly',
        Headers: 'readonly',
        Request: 'readonly',
        Response: 'readonly',
        AbortController: 'readonly',
        AbortSignal: 'readonly',
        Image: 'readonly',
        ImageBitmap: 'readonly',
        createImageBitmap: 'readonly',
        ResizeObserver: 'readonly',
        IntersectionObserver: 'readonly',
        MutationObserver: 'readonly',
        matchMedia: 'readonly',
        crypto: 'readonly',
        performance: 'readonly',
        location: 'readonly',
        history: 'readonly',
        alert: 'readonly',
        globalThis: 'readonly',
        HTMLElement: 'readonly',
        HTMLInputElement: 'readonly',
        HTMLImageElement: 'readonly',
        HTMLDivElement: 'readonly',
        HTMLFormElement: 'readonly',
        HTMLCanvasElement: 'readonly',
        CanvasImageSource: 'readonly',
        Element: 'readonly',
        Node: 'readonly',
        Event: 'readonly',
        KeyboardEvent: 'readonly',
        MouseEvent: 'readonly',
        PointerEvent: 'readonly',
        MediaQueryList: 'readonly',
        MediaStream: 'readonly',
        RequestInit: 'readonly',
        process: 'readonly',
      },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // Las mismas tres que la API, por los mismos motivos.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',

      ...reactHooks.configs.recommended.rules,
    },
  },
  {
    // Igual que en la API: una prueba manipula formas dinámicas —respuestas
    // fingidas, `expect` sobre cuerpos sin tipar— y exigirle tipos estrictos
    // produce ruido, no seguridad.
    files: [
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
      'src/**/*.dom.test.ts',
      'src/**/*.dom.test.tsx',
      'src/pruebas/**',
    ],
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
