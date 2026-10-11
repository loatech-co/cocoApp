// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { APP_SESSION, leaveNativeApp } from '@/test-support/fake-app';

import {
  changePassword,
  currentState,
  currentToken,
  discardSession,
  renew,
  SessionError,
  signOutEverywhere,
} from './session';

/**
 * The session in the BROWSER, where the refresh lives in a cookie.
 *
 * What is checked is what a failure means: the server's «no» ends the
 * session, anything else keeps it. And that the two calls that do not go
 * through the API client still renew before going out.
 */

const user = { ...APP_SESSION.user, displayName: 'Ana', createdAt: '2026-01-01T00:00:00.000Z' };

function session(accessToken: string, expiresIn = 900) {
  return { data: { accessToken, expiresIn, user } };
}

function reply(status: number, body: unknown = session('renovado')): Response {
  return { status, ok: status < 400, json: () => Promise.resolve(body) } as unknown as Response;
}

/** The `/auth` paths called, without the base. */
function calledPaths(fakeFetch: ReturnType<typeof vi.fn>): string[] {
  return fakeFetch.mock.calls.map((call) =>
    String((call as unknown[])[0]).replace(/^.*\/auth\//, '/auth/'),
  );
}

function bearerOf(fakeFetch: ReturnType<typeof vi.fn>, call: number): string | undefined {
  const init = (fakeFetch.mock.calls[call] as unknown[])[1] as RequestInit;
  return (init.headers as Record<string, string>).Authorization;
}

/** A signed-in session, with `secondsLeft` on its token. */
async function signedIn(fakeFetch: ReturnType<typeof vi.fn>, secondsLeft = 900): Promise<void> {
  fakeFetch.mockResolvedValueOnce(reply(200, session('vigente', secondsLeft)));
  await renew();
  expect(currentToken()).toBe('vigente');
}

let fakeFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  leaveNativeApp();
  discardSession();
  fakeFetch = vi.fn();
  vi.stubGlobal('fetch', fakeFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('renew() when it fails', () => {
  it('a network drop keeps the session and tries again shortly', async () => {
    await signedIn(fakeFetch);
    fakeFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    await expect(renew()).resolves.toBe(false);

    expect(currentToken()).toBe('vigente');
    expect(currentState().user?.email).toBe('g@coco.app');

    fakeFetch.mockResolvedValueOnce(reply(200, session('renovado')));
    await vi.advanceTimersByTimeAsync(5_000);
    expect(calledPaths(fakeFetch)).toEqual(['/auth/refresh', '/auth/refresh', '/auth/refresh']);
    expect(currentToken()).toBe('renovado');
  });

  it('a 5xx —the server restarting— keeps the session too', async () => {
    await signedIn(fakeFetch);
    fakeFetch.mockResolvedValueOnce(reply(503, null));

    await expect(renew()).resolves.toBe(false);

    expect(currentToken()).toBe('vigente');
  });

  it('a 401 is the server saying no: the session ends', async () => {
    await signedIn(fakeFetch);
    fakeFetch.mockResolvedValueOnce(reply(401, { status: 401, code: 'invalid_refresh' }));

    await expect(renew()).resolves.toBe(false);

    expect(currentToken()).toBeNull();
    expect(currentState().user).toBeNull();
  });

  it('without a session to keep, a network drop leaves it empty and not loading', async () => {
    fakeFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    await expect(renew()).resolves.toBe(false);

    expect(currentToken()).toBeNull();
    expect(currentState().isLoading).toBe(false);
  });
});

describe('signOutEverywhere()', () => {
  it('renews first when the token is about to expire, and sends the new one', async () => {
    await signedIn(fakeFetch, 30);
    fakeFetch.mockResolvedValueOnce(reply(200, session('renovado')));
    fakeFetch.mockResolvedValueOnce(reply(204, null));

    await signOutEverywhere();

    expect(calledPaths(fakeFetch)).toEqual(['/auth/refresh', '/auth/refresh', '/auth/logout-all']);
    expect(bearerOf(fakeFetch, 2)).toBe('Bearer renovado');
    expect(currentToken()).toBeNull();
  });

  it('does not renew when the token has time left', async () => {
    await signedIn(fakeFetch);
    fakeFetch.mockResolvedValueOnce(reply(204, null));

    await signOutEverywhere();

    expect(calledPaths(fakeFetch)).toEqual(['/auth/refresh', '/auth/logout-all']);
  });

  it('a 401 is a failure, not a session already closed', async () => {
    await signedIn(fakeFetch);
    fakeFetch.mockResolvedValueOnce(reply(401, null));

    await expect(signOutEverywhere()).rejects.toBeInstanceOf(SessionError);

    // Nothing was closed on the server: nothing is pretended here either.
    expect(currentToken()).toBe('vigente');
  });
});

describe('changePassword()', () => {
  it('renews first when the token is about to expire', async () => {
    await signedIn(fakeFetch, 30);
    fakeFetch.mockResolvedValueOnce(reply(200, session('renovado')));
    fakeFetch.mockResolvedValueOnce(reply(204, null));

    await changePassword('anterior', 'nueva');

    expect(calledPaths(fakeFetch)).toEqual([
      '/auth/refresh',
      '/auth/refresh',
      '/auth/change-password',
    ]);
    expect(bearerOf(fakeFetch, 2)).toBe('Bearer renovado');
    expect(currentToken()).toBeNull();
  });
});
