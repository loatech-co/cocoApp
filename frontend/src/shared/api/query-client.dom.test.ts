// @vitest-environment jsdom
import { QueryObserver } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { APP_SESSION } from '@/test-support/fake-app';

import { ApiClientError } from './api-client';
import { clearCacheOnUserChange, createQueryClient, refocus, shouldRetry } from './query-client';
import { invalidateDerived, keys } from './query-keys';
import { discardSession, receiveSession } from './session';

const error = (status: number) => new ApiClientError(status, 'x', 'x');

describe('shouldRetry()', () => {
  it.each([400, 401, 403, 404, 409, 422, 429])('never retries a %i: it is an answer', (status) => {
    expect(shouldRetry(0, error(status))).toBe(false);
  });

  it.each([500, 502, 503])('retries a %i once', (status) => {
    expect(shouldRetry(0, error(status))).toBe(true);
    expect(shouldRetry(1, error(status))).toBe(false);
  });

  it('retries a network failure (fetch rejects with TypeError) once', () => {
    expect(shouldRetry(0, new TypeError('Failed to fetch'))).toBe(true);
    expect(shouldRetry(1, new TypeError('Failed to fetch'))).toBe(false);
  });
});

describe('refocus(): the phone app came back to the foreground', () => {
  it('refetches a stale mounted query, as a browser does on tab focus', async () => {
    const client = createQueryClient();
    client.mount();
    const queryFn = vi.fn(() => Promise.resolve('dato'));
    const observer = new QueryObserver(client, { queryKey: ['x'], queryFn, staleTime: 0 });
    const unsubscribe = observer.subscribe(() => undefined);
    await vi.waitFor(() => expect(queryFn).toHaveBeenCalledTimes(1));

    refocus();

    await vi.waitFor(() => expect(queryFn).toHaveBeenCalledTimes(2));
    unsubscribe();
    client.unmount();
  });
});

describe('invalidateDerived(): what `capturado` refreshes', () => {
  it('marks movements, accounts and the summary stale, and nothing else', () => {
    const client = createQueryClient();
    client.setQueryData(keys.transactions({ page: 1 }), {});
    client.setQueryData(keys.dashboard(), {});
    client.setQueryData(keys.accounts, []);
    client.setQueryData(keys.categories, []);

    invalidateDerived(client);

    const stale = (key: readonly unknown[]) => client.getQueryState(key)?.isInvalidated;
    expect(stale(keys.transactions({ page: 1 }))).toBe(true);
    expect(stale(keys.dashboard())).toBe(true);
    expect(stale(keys.accounts)).toBe(true);
    expect(stale(keys.categories)).toBe(false);
  });
});

describe('clearCacheOnUserChange()', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    discardSession();
  });

  afterEach(() => {
    discardSession();
    vi.useRealTimers();
  });

  it('empties the cache on sign out, so the next person sees nothing of the previous one', () => {
    const client = createQueryClient();
    const stop = clearCacheOnUserChange(client);

    receiveSession(APP_SESSION);
    client.setQueryData(keys.accounts, [{ id: 1 }]);
    expect(client.getQueryData(keys.accounts)).toBeDefined();

    discardSession();
    expect(client.getQueryData(keys.accounts)).toBeUndefined();
    stop();
  });

  it('empties it when a different account signs in, and not on the first sign in', () => {
    const client = createQueryClient();
    const stop = clearCacheOnUserChange(client);

    client.setQueryData(['previa'], 'antes');
    receiveSession(APP_SESSION);
    expect(client.getQueryData(['previa'])).toBe('antes');

    client.setQueryData(keys.accounts, [{ id: 1 }]);
    receiveSession({ ...APP_SESSION, user: { ...APP_SESSION.user, id: 999 } });
    expect(client.getQueryData(keys.accounts)).toBeUndefined();
    stop();
  });
});
