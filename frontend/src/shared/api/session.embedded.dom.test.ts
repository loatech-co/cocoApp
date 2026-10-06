// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { APP_SESSION, fakeNativeApp, leaveNativeApp } from '@/test-support/fake-app';

import {
  changePassword,
  discardSession,
  currentState,
  receiveSession,
  renew,
  signOut,
  signOutEverywhere,
  sessionClosed,
  currentToken,
} from './session';

/**
 * La sesión DENTRO de la app del teléfono.
 *
 * Lo que se comprueba es la frontera: qué va a la red y qué va por el puente.
 * La web embebida no tiene refresh token, así que ninguna de estas llamadas
 * puede acabar en `/auth/refresh` ni en `/auth/logout`; y de lo que se le
 * cuenta a la app depende su llavero, así que importa tanto lo que se avisa
 * como lo que NO.
 */

/** What `/api/v2/auth/refresh` answers: the v2 session, camelCase. */
const V2_SESSION = {
  accessToken: 'token-de-la-network',
  expiresIn: 900,
  user: { ...APP_SESSION.user, displayName: 'Gerardo', createdAt: '2026-01-01T00:00:00.000Z' },
};

function fetchReplying(status: number, body: unknown = { data: V2_SESSION }) {
  return vi.fn(() =>
    Promise.resolve({
      status,
      ok: status < 400,
      json: () => Promise.resolve(body),
    } as unknown as Response),
  );
}

/** Las rutas de `/auth` a las que se llamó por la network, sin la base (que viene del `.env`). */
function calledPaths(fakeFetch: ReturnType<typeof fetchReplying>): string[] {
  return fakeFetch.mock.calls.map((call) =>
    String((call as unknown[])[0]).replace(/^.*\/auth\//, '/auth/'),
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  discardSession();
});

afterEach(() => {
  leaveNativeApp();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('Con puente', () => {
  it('renovar() no toca /auth/refresh y guarda lo que contesta la app', async () => {
    const network = fetchReplying(200);
    vi.stubGlobal('fetch', network);
    const { cocoSesion } = fakeNativeApp();

    await expect(renew()).resolves.toBe(true);

    expect(network).not.toHaveBeenCalled();
    expect(cocoSesion.postMessage).toHaveBeenCalledWith({ tipo: 'pedirSesion' });
    expect(currentToken()).toBe('token-de-la-app');
    expect(currentState().user?.email).toBe('g@coco.app');
    expect(currentState().isLoading).toBe(false);
  });

  it('dos renovar() a la vez son UN solo mensaje a la app', async () => {
    const { cocoSesion } = fakeNativeApp();

    await Promise.all([renew(), renew()]);

    // La app rota el refresh en cada uso y GoTrue detecta reusos: dos
    // peticiones a la vez matarían la familia. Por eso comparten promesa.
    expect(cocoSesion.postMessage).toHaveBeenCalledTimes(1);
  });

  it('si el puente falla, limpia la memoria y NO avisa a la app', async () => {
    const { cocoEventos } = fakeNativeApp({ failWith: 'sin network' });

    await expect(renew()).resolves.toBe(false);

    expect(currentToken()).toBeNull();
    expect(currentState().isLoading).toBe(false);
    // Un fallo de red del puente nunca tira el llavero.
    expect(cocoEventos.postMessage).not.toHaveBeenCalled();
  });

  it('salir() avisa «salir» y no llama a /auth/logout', async () => {
    const network = fetchReplying(204);
    vi.stubGlobal('fetch', network);
    const { cocoEventos } = fakeNativeApp();
    await renew();

    await signOut();

    expect(cocoEventos.postMessage).toHaveBeenCalledWith({ tipo: 'salir' });
    expect(network).not.toHaveBeenCalled();
    expect(currentToken()).toBeNull();
  });

  it('cambiarContrasena() avisa «sesionCerrada»', async () => {
    vi.stubGlobal('fetch', fetchReplying(204));
    const { cocoEventos } = fakeNativeApp();
    await renew();

    await changePassword('vieja', 'nueva');

    expect(cocoEventos.postMessage).toHaveBeenCalledWith({ tipo: 'sesionCerrada' });
    expect(currentToken()).toBeNull();
  });

  it('salirDeTodosLosDispositivos() avisa «sesionCerrada»', async () => {
    vi.stubGlobal('fetch', fetchReplying(204));
    const { cocoEventos } = fakeNativeApp();
    await renew();

    await signOutEverywhere();

    expect(cocoEventos.postMessage).toHaveBeenCalledWith({ tipo: 'sesionCerrada' });
    expect(currentToken()).toBeNull();
  });

  it('descartarSesion() NO avisa', async () => {
    const { cocoEventos } = fakeNativeApp();
    await renew();

    discardSession();

    expect(currentToken()).toBeNull();
    expect(cocoEventos.postMessage).not.toHaveBeenCalled();
  });

  it('recibirSesion() restaura y sesionCerrada() limpia', () => {
    fakeNativeApp();

    receiveSession(APP_SESSION);
    expect(currentToken()).toBe('token-de-la-app');
    expect(currentState().user?.displayName).toBe('Gerardo');

    sessionClosed();
    expect(currentToken()).toBeNull();
    expect(currentState().user).toBeNull();
  });
});

describe('Sin puente', () => {
  it('renovar() sigue yendo por la network, con la cookie', async () => {
    const network = fetchReplying(200);
    vi.stubGlobal('fetch', network);
    leaveNativeApp();

    await expect(renew()).resolves.toBe(true);

    expect(calledPaths(network)).toEqual(['/auth/refresh']);
    expect(String((network.mock.calls[0] as unknown[])[0])).toMatch(/\/api\/v2\/auth\/refresh$/);
    expect((network.mock.calls[0] as unknown[])[1]).toMatchObject({ credentials: 'include' });
    expect(currentToken()).toBe('token-de-la-network');
    expect(currentState().user?.displayName).toBe('Gerardo');
  });

  /*
    The v2 refresh cookie lives in `Path=/api/v2/auth`, so the v1 cookie every
    browser has today never reaches it: after the deploy each person signs in
    once. That first refresh is a 401, and it has to end in the sign-in screen
    and nothing else —no thrown error, no toast, no session half kept.
  */
  it('sin la cookie de la v2, renovar() deja la sesión vacía sin lanzar', async () => {
    const network = fetchReplying(401, {
      type: 'https://dev-cocoapp.viteri.me/problems/unauthenticated',
      title: 'Hace falta iniciar sesión',
      status: 401,
      detail: 'Sesión no válida.',
      code: 'unauthenticated',
    });
    vi.stubGlobal('fetch', network);
    leaveNativeApp();

    await expect(renew()).resolves.toBe(false);

    expect(currentToken()).toBeNull();
    expect(currentState()).toEqual({ user: null, isLoading: false });
  });

  it('salir() llama a /auth/logout', async () => {
    const network = fetchReplying(204);
    vi.stubGlobal('fetch', network);
    leaveNativeApp();

    await signOut();

    expect(calledPaths(network)).toEqual(['/auth/logout']);
  });
});
