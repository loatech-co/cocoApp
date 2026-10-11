// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { leaveNativeApp } from '@/test-support/fake-app';

import { ApiClientError, apiRequest, apiUpload } from './api-client';
import { currentToken, discardSession, renew } from './session';

/**
 * What the client does when the server rejects the token (round 4, W1 and W2).
 *
 * The three outcomes of the renewal after a 401 are checked for `apiRequest`
 * and for `apiUpload`: renewed → the call is retried with the new token;
 * rejected by the server → the session is over; failed for any other reason
 * → the session survives and the caller gets a network error.
 */

const user = { id: 'u1', email: 'g@coco.app', displayName: 'Ana', role: 'user' };

function session(accessToken: string) {
  return { data: { accessToken, expiresIn: 900, user } };
}

function reply(status: number, body: unknown = null): Response {
  return {
    status,
    ok: status < 400,
    headers: new Headers({ 'Content-Type': 'application/json' }),
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

/** Every call, as `path` + the bearer it carried. */
function calls(fakeFetch: ReturnType<typeof vi.fn>): { path: string; bearer?: string }[] {
  return fakeFetch.mock.calls.map((call) => {
    const [url, init] = call as [string, RequestInit];
    const headers = init.headers;
    const bearer =
      headers instanceof Headers
        ? (headers.get('Authorization') ?? undefined)
        : (headers as Record<string, string> | undefined)?.Authorization;
    return { path: url.replace(/^.*\/api\/v2/, ''), ...(bearer ? { bearer } : {}) };
  });
}

/** The fake XMLHttpRequest: one scripted reply per `send`, in order. */
interface Scripted {
  status?: number;
  body?: unknown;
  networkError?: true;
}

function fakeXhr(script: Scripted[]) {
  const sent: { bearer?: string }[] = [];
  class FakeXhr {
    status = 0;
    responseText = '';
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    upload = { onprogress: null as ((e: ProgressEvent) => void) | null };
    private bearer: string | undefined;
    open(): void {}
    setRequestHeader(name: string, value: string): void {
      if (name === 'Authorization') this.bearer = value;
    }
    send(): void {
      sent.push(this.bearer ? { bearer: this.bearer } : {});
      const next = script.shift() ?? { networkError: true };
      queueMicrotask(() => {
        if (next.networkError) {
          this.onerror?.();
          return;
        }
        this.status = next.status ?? 200;
        this.responseText = next.body === undefined ? '' : JSON.stringify(next.body);
        this.onload?.();
      });
    }
  }
  vi.stubGlobal('XMLHttpRequest', FakeXhr);
  return sent;
}

let fakeFetch: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  vi.useFakeTimers();
  leaveNativeApp();
  discardSession();
  fakeFetch = vi.fn();
  vi.stubGlobal('fetch', fakeFetch);
  fakeFetch.mockResolvedValueOnce(reply(200, session('vigente')));
  await renew();
  fakeFetch.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('apiRequest() after a 401', () => {
  it('renews once and retries with the new token', async () => {
    fakeFetch
      .mockResolvedValueOnce(reply(401, { status: 401, code: 'unauthenticated' }))
      .mockResolvedValueOnce(reply(200, session('renovado')))
      .mockResolvedValueOnce(reply(200, { data: { ok: true } }));

    await expect(apiRequest('/api/v2/things')).resolves.toEqual({ data: { ok: true } });

    expect(calls(fakeFetch)).toEqual([
      { path: '/things', bearer: 'Bearer vigente' },
      { path: '/auth/refresh' },
      { path: '/things', bearer: 'Bearer renovado' },
    ]);
  });

  it('ends the session when the server rejects the renewal', async () => {
    fakeFetch
      .mockResolvedValueOnce(reply(401, { status: 401, code: 'unauthenticated' }))
      .mockResolvedValueOnce(reply(401, { status: 401, code: 'invalid_refresh' }));

    const failure = await apiRequest('/api/v2/things').catch((e: unknown) => e);

    expect(failure).toBeInstanceOf(ApiClientError);
    expect((failure as ApiClientError).code).toBe('unauthenticated');
    expect((failure as ApiClientError).isUnauthenticated).toBe(true);
    expect(currentToken()).toBeNull();
    expect(fakeFetch).toHaveBeenCalledTimes(2);
  });

  it('keeps the session and reports the network when the renewal cannot reach the server', async () => {
    fakeFetch
      .mockResolvedValueOnce(reply(401, { status: 401, code: 'unauthenticated' }))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const failure = await apiRequest('/api/v2/things').catch((e: unknown) => e);

    expect(failure).toBeInstanceOf(ApiClientError);
    expect((failure as ApiClientError).code).toBe('network_error');
    expect((failure as ApiClientError).status).toBe(0);
    expect(currentToken()).toBe('vigente');
    expect(fakeFetch).toHaveBeenCalledTimes(2);
  });
});

describe('apiUpload() after a 401', () => {
  const form = new FormData();

  it('renews once and resends with the new token', async () => {
    const sent = fakeXhr([
      { status: 401, body: { status: 401, code: 'unauthenticated' } },
      { status: 201, body: { data: { id: 'r1' } } },
    ]);
    fakeFetch.mockResolvedValueOnce(reply(200, session('renovado')));

    await expect(apiUpload('/api/v2/receipts', form)).resolves.toEqual({ id: 'r1' });

    expect(sent).toEqual([{ bearer: 'Bearer vigente' }, { bearer: 'Bearer renovado' }]);
    expect(calls(fakeFetch)).toEqual([{ path: '/auth/refresh' }]);
  });

  it('ends the session when the server rejects the renewal', async () => {
    const sent = fakeXhr([{ status: 401, body: { status: 401, code: 'unauthenticated' } }]);
    fakeFetch.mockResolvedValueOnce(reply(401, { status: 401, code: 'invalid_refresh' }));

    const failure = await apiUpload('/api/v2/receipts', form).catch((e: unknown) => e);

    expect((failure as ApiClientError).code).toBe('unauthenticated');
    expect(currentToken()).toBeNull();
    expect(sent).toHaveLength(1);
  });

  it('keeps the session and reports the network when the renewal cannot reach the server', async () => {
    const sent = fakeXhr([{ status: 401, body: { status: 401, code: 'unauthenticated' } }]);
    fakeFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const failure = await apiUpload('/api/v2/receipts', form).catch((e: unknown) => e);

    expect((failure as ApiClientError).code).toBe('network_error');
    expect(currentToken()).toBe('vigente');
    expect(sent).toHaveLength(1);
  });

  it('a second 401 after a good renewal is final', async () => {
    fakeXhr([
      { status: 401, body: { status: 401, code: 'unauthenticated' } },
      { status: 401, body: { status: 401, code: 'unauthenticated' } },
    ]);
    fakeFetch.mockResolvedValueOnce(reply(200, session('renovado')));

    const failure = await apiUpload('/api/v2/receipts', form).catch((e: unknown) => e);

    expect((failure as ApiClientError).status).toBe(401);
    expect(currentToken()).toBeNull();
  });
});
