import { vi } from 'vitest';

import { USER_AGENT_APP, type BridgeSession } from '@/shared/lib/native-contract';

/**
 * Finge que la web corre dentro de la app del teléfono.
 *
 * Pone las DOS señales que `enLaApp()` exige —la marca en el `User-Agent` y
 * el puente en `window.webkit`— con espías en los dos manejadores, para que
 * una prueba pueda ver qué se le pidió y qué se le contó a la app. Lo usan
 * las cinco pruebas del modo embebido; escrito en cada una, la forma del
 * puente se habría copiado cinco veces.
 *
 * Solo tiene sentido con DOM: fuera de jsdom no hay `window` que vestir.
 */
export function fakeNativeApp(options: { session?: unknown; failWith?: string } = {}) {
  const cocoSesion = {
    postMessage: vi.fn(() =>
      options.failWith !== undefined
        ? Promise.reject(new Error(options.failWith))
        : Promise.resolve(options.session ?? APP_SESSION),
    ),
  };
  const cocoEventos = { postMessage: vi.fn() };

  Object.defineProperty(navigator, 'userAgent', {
    value: `Mozilla/5.0 (iPhone) ${USER_AGENT_APP}0.1.0`,
    configurable: true,
  });
  window.webkit = { messageHandlers: { cocoSesion, cocoEventos } };

  return { cocoSesion, cocoEventos };
}

/** Deshace `fingirLaApp()`: vuelve a ser un navegador normal. */
export function leaveNativeApp(): void {
  Object.defineProperty(navigator, 'userAgent', {
    value: 'Mozilla/5.0 (navegador de pruebas)',
    configurable: true,
  });
  delete window.webkit;
  delete window.__coco;
}

/** Lo que la app contesta a `pedirSesion`: una sesión SIN refresh token. */
export const APP_SESSION: BridgeSession = {
  access_token: 'token-de-la-app',
  expires_in: 900,
  user: {
    id: 1,
    email: 'g@coco.app',
    display_name: 'Gerardo',
    role: 'user',
    status: 'active',
    created_at: '2026-01-01T00:00:00.000Z',
  },
};
