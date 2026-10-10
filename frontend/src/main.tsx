import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { Providers } from '@/app/providers';
import { AppRouter } from '@/app/router';
import { installVersionReload } from '@/app/version-reload';
import { isInNativeApp } from '@/shared/lib/bridge';
import './index.css';

// Initial theme: the system preference is respected. Later on (T5) the user
// will be able to set it and it will persist in user_preferences.
if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
  document.documentElement.classList.add('dark');
}

// Inside the phone app the bottom bar is the native one, outside the
// webview: the CSS reads this mark so as not to reserve room for one that is
// not there. It is set before the first render, so no paint sees it change.
if (isInNativeApp()) {
  document.documentElement.dataset.embebido = 'si';
}

// A new deploy makes the hashed chunks of an open tab stale: it reloads once
// to bring the new ones (see the file).
installVersionReload();

const container = document.getElementById('root');
if (!container) {
  throw new Error('The #root element was not found in index.html');
}

createRoot(container).render(
  <StrictMode>
    <Providers>
      <AppRouter />
    </Providers>
  </StrictMode>,
);
