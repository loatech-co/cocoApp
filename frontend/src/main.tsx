import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { Providers } from '@/app/providers';
import { AppRouter } from '@/app/router';
import { enLaApp } from '@/shared/lib/puente-nativo';
import './index.css';

// Tema inicial: se respeta la preferencia del sistema. Más adelante (T5) el
// usuario podrá fijarlo y se persistirá en user_preferences.
if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
  document.documentElement.classList.add('dark');
}

// Dentro de la app del teléfono la barra de abajo es la nativa, fuera del
// webview: el CSS lee esta marca para no reservarle hueco a una que no está.
// Se pone antes del primer render, para que ningún pintado la vea cambiar.
if (enLaApp()) {
  document.documentElement.dataset.embebido = 'si';
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
