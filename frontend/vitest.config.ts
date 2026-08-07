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
});
