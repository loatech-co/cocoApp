import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Las pruebas de componentes necesitan un DOM; los parsers y la lógica pura no
 * —y corren mucho más rápido sin él—. Por eso el entorno no se fija aquí de
 * forma global: cada archivo que lo necesite lo pide con la anotación
 * `@vitest-environment jsdom` en su primera línea.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    // Lo que jsdom no trae. Se carga en TODOS los archivos, también en los que
    // corren sin DOM: el propio archivo comprueba si hay ventana antes de
    // tocar nada, que es más barato que mantener aquí una lista de cuáles sí.
    setupFiles: ['./src/pruebas/entorno.ts'],
    // Plan 7.7: 70 % of lines and branches in `frontend/src`. The thresholds
    // only go up: a PR that lowers them needs a written reason in its ADR.
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/*.stories.tsx',
        'src/pruebas/**',
        'src/**/*.d.ts',
      ],
      reporter: ['text-summary', 'json-summary'],
      // Measured when the gate was set (step 7.7-web-b): 55.36 % lines and
      // 49.63 % branches overall; 98.25 / 96.11 in `shared/ui`. The gap to the
      // plan's 70 % is in `features/` (see CONTRIBUTING, "Frontend coverage").
      thresholds: {
        lines: 55,
        branches: 49,
        'src/shared/ui/**': { lines: 98, branches: 96 },
      },
    },
  },
});
