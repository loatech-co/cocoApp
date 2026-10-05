import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@coco/lectura': fileURLToPath(new URL('../packages/lectura/src/index.ts', import.meta.url)),
    },
  },
  build: {
    // Sin sourcemaps en producción: no se regalan las rutas del código.
    sourcemap: false,
    // Tesseract.js y pdf.js (Fase 2) son grandes y NO deben entrar al bundle
    // inicial; se cargarán con import() dinámico al abrir Importar.
    chunkSizeWarningLimit: 900,
  },
  server: {
    port: 5173,
  },
});
