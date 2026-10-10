import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@coco/receipt-parser': fileURLToPath(
        new URL('../packages/receipt-parser/src/index.ts', import.meta.url),
      ),
    },
  },
  build: {
    // No sourcemaps in production: the code's paths are not given away.
    sourcemap: false,
    // Top-level await: `shared/lib/i18n.ts` waits for the text catalog
    // (step 7.3, ADR 0025). Vite's default stops at Safari 14; every browser
    // listed here has it, and the iOS app's WebView (iOS 17) is past them all.
    target: ['es2022', 'chrome89', 'edge89', 'firefox89', 'safari15'],
    // Tesseract.js and pdf.js (phase 2) are large and must NOT go into the
    // initial bundle; they are loaded with a dynamic import() when Import opens.
    chunkSizeWarningLimit: 900,
  },
  server: {
    port: 5173,
  },
});
