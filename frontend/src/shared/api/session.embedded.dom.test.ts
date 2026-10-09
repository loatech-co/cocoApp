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
 * The session INSIDE the phone app.
 *
 * What is checked is the boundary: what goes to the network and what goes over
 * the bridge. The embedded web has no refresh token, so none of these calls
 * may end in `/auth/refresh` or `/auth/logout`; and the app's keychain depends
 * on what it is told, so what it is told matters as much as what it is NOT.
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

/** The `/auth` paths called over the network, without the base (which comes from `.env`). */
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

describe('With a bridge', () => {
  it('renew() does not touch /auth/refresh and stores what the app answers', async () => {
    const network = fetchReplying(200);
    vi.stubGlobal('fetch', network);
    const { cocoSession } = fakeNativeApp();

    await expect(renew()).resolves.toBe(true);

    expect(network).not.toHaveBeenCalled();
    expect(cocoSession.postMessage).toHaveBeenCalledWith({ type: 'requestSession' });
    expect(currentToken()).toBe('token-de-la-app');
    expect(currentState().user?.email).toBe('g@coco.app');
    expect(currentState().isLoading).toBe(false);
  });

  it('two renew() at once are ONE message to the app', async () => {
    const { cocoSession } = fakeNativeApp();

    await Promise.all([renew(), renew()]);

    // The app rotates the refresh on every use and GoTrue detects reuse: two
    // requests at once would kill the family. That is why they share a promise.
    expect(cocoSession.postMessage).toHaveBeenCalledTimes(1);
  });

  it('if the bridge fails, it clears the memory and does NOT tell the app', async () => {
    const { cocoEvents } = fakeNativeApp({ failWith: 'sin network' });

    await expect(renew()).resolves.toBe(false);

    expect(currentToken()).toBeNull();
    expect(currentState().isLoading).toBe(false);
    // A network failure of the bridge never wipes the keychain.
    expect(cocoEvents.postMessage).not.toHaveBeenCalled();
  });

  it('signOut() sends «signOut» and does not call /auth/logout', async () => {
    const network = fetchReplying(204);
    vi.stubGlobal('fetch', network);
    const { cocoEvents } = fakeNativeApp();
    await renew();

    await signOut();

    expect(cocoEvents.postMessage).toHaveBeenCalledWith({ type: 'signOut' });
    expect(network).not.toHaveBeenCalled();
    expect(currentToken()).toBeNull();
  });

  it('changePassword() sends «sessionClosed»', async () => {
    vi.stubGlobal('fetch', fetchReplying(204));
    const { cocoEvents } = fakeNativeApp();
    await renew();

    await changePassword('vieja', 'nueva');

    expect(cocoEvents.postMessage).toHaveBeenCalledWith({ type: 'sessionClosed' });
    expect(currentToken()).toBeNull();
  });

  it('signOutEverywhere() sends «sessionClosed»', async () => {
    vi.stubGlobal('fetch', fetchReplying(204));
    const { cocoEvents } = fakeNativeApp();
    await renew();

    await signOutEverywhere();

    expect(cocoEvents.postMessage).toHaveBeenCalledWith({ type: 'sessionClosed' });
    expect(currentToken()).toBeNull();
  });

  it('discardSession() does NOT tell the app', async () => {
    const { cocoEvents } = fakeNativeApp();
    await renew();

    discardSession();

    expect(currentToken()).toBeNull();
    expect(cocoEvents.postMessage).not.toHaveBeenCalled();
  });

  it('receiveSession() restores and sessionClosed() clears', () => {
    fakeNativeApp();

    receiveSession(APP_SESSION);
    expect(currentToken()).toBe('token-de-la-app');
    expect(currentState().user?.displayName).toBe('Gerardo');

    sessionClosed();
    expect(currentToken()).toBeNull();
    expect(currentState().user).toBeNull();
  });
});

describe('Without a bridge', () => {
  it('renew() still goes over the network, with the cookie', async () => {
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
  it('without the v2 cookie, renew() leaves the session empty without throwing', async () => {
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

  it('signOut() calls /auth/logout', async () => {
    const network = fetchReplying(204);
    vi.stubGlobal('fetch', network);
    leaveNativeApp();

    await signOut();

    expect(calledPaths(network)).toEqual(['/auth/logout']);
  });
});
