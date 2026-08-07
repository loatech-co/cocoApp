import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { Providers } from '@/app/providers';
import { AppRouter } from '@/app/router';
import './index.css';

// Tema inicial: se respeta la preferencia del sistema. Más adelante (T5) el
// usuario podrá fijarlo y se persistirá en user_preferences.
if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
  document.documentElement.classList.add('dark');
}

const container = document.getElementById('root');
if (!container) {
  throw new Error('No se encontró el elemento #root en index.html');
}

createRoot(container).render(
  <StrictMode>
    <Providers>
      <AppRouter />
    </Providers>
  </StrictMode>,
);
