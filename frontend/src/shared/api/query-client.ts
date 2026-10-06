import { focusManager, QueryClient } from '@tanstack/react-query';

import { ApiClientError } from './api-client';
import { estadoActual, suscribirse } from './session';

/** One retry, as before: enough for a blip, not enough to hide an outage. */
const MAX_RETRIES = 1;

/**
 * Whether a failed query is worth asking again.
 *
 * Only what can change on its own: the network (`fetch` rejects with a
 * `TypeError`) and the server (5xx). A 4xx is an ANSWER —no session, no
 * permission, it does not exist, the filter is invalid— and asking again gets
 * the same answer one second later, with the skeleton on screen meanwhile.
 * A 401 is worse: `apiRequest` already renewed once, and a second round would
 * renew again.
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= MAX_RETRIES) return false;
  if (error instanceof ApiClientError) return error.status >= 500;
  return true;
}

/**
 * The app's `QueryClient`.
 *
 * `refetchOnWindowFocus` is on: coming back to the tab refetches what is
 * stale (older than `staleTime`). Inside the phone app there is no window
 * focus, so the app says so over the bridge (`refocus`).
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: true,
        retry: shouldRetry,
      },
    },
  });
}

/**
 * The phone app came back to the foreground.
 *
 * A `WKWebView` does not get the window focus a browser tab gets, so React
 * Query never learns it is being looked at again. A focus PULSE —focused, then
 * back to following `document.visibilityState`— makes every mounted query
 * refetch if it is stale, exactly like returning to a tab.
 */
export function refocus(): void {
  focusManager.setFocused(true);
  focusManager.setFocused(undefined);
}

/**
 * Empties the cache whenever the person changes: on sign out, and when a
 * different account signs in on the same browser or web view.
 *
 * Listening to the session instead of calling it from `salir()` covers every
 * exit at once: the button, «close everywhere», a password change, the app
 * closing the session, an unrecoverable 401. Without this, the next person
 * would see the previous one's movements until each query refetched.
 */
export function clearCacheOnUserChange(queryClient: QueryClient): () => void {
  let userId = estadoActual().usuario?.id ?? null;
  return suscribirse((estado) => {
    const next = estado.usuario?.id ?? null;
    if (next !== userId && userId !== null) queryClient.clear();
    userId = next;
  });
}
