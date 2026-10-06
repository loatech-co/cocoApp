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
    // Top-level await: `shared/lib/i18n.ts` waits for the text catalog
    // (step 7.3, ADR 0024). Vite's default stops at Safari 14; every browser
    // listed here has it, and the iOS app's WebView (iOS 17) is past them all.
    target: ['es2022', 'chrome89', 'edge89', 'firefox89', 'safari15'],
    // Tesseract.js y pdf.js (Fase 2) son grandes y NO deben entrar al bundle
    // inicial; se cargarán con import() dinámico al abrir Importar.
    chunkSizeWarningLimit: 900,
  },
  server: {
    port: 5173,
  },
});
