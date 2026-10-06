import { vi } from 'vitest';

import { USER_AGENT_APP, type BridgeSession } from '@/shared/lib/native-contract';

/**
 * Pretends the web runs inside the phone app.
 *
 * Sets the TWO signals `isInNativeApp()` requires —the mark in the
 * `User-Agent` and the bridge in `window.webkit`— with spies on both handlers,
 * so a test can see what the app was asked and what it was told. The five
 * tests of the embedded mode use it; written in each of them, the shape of the
 * bridge would have been copied five times.
 *
 * It only makes sense with a DOM: outside jsdom there is no `window` to dress.
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

/** Undoes `fakeNativeApp()`: back to being a normal browser. */
export function leaveNativeApp(): void {
  Object.defineProperty(navigator, 'userAgent', {
    value: 'Mozilla/5.0 (navegador de pruebas)',
    configurable: true,
  });
  delete window.webkit;
  delete window.__coco;
}

/** What the app answers to `pedirSesion`: a session WITHOUT a refresh token. */
export const APP_SESSION: BridgeSession = {
  accessToken: 'token-de-la-app',
  expiresIn: 900,
  user: {
    id: 1,
    email: 'g@coco.app',
    displayName: 'Gerardo',
    role: 'user',
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
};
