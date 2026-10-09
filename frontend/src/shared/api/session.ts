import { notifyApp, isInNativeApp, requestSession } from '@/shared/lib/bridge';
import { t } from '@/shared/lib/i18n';
import { type BridgeSession } from '@/shared/lib/native-contract';

import type { ProblemFieldError, Profile, Registration, Session } from './generated/model';
import { API_ORIGIN } from './origin';
import { readProblem } from './problem';

/**
 * The auth routes, written here and not taken from the generated client.
 *
 * Every generated function goes through `apiRequest`, which renews the session
 * —that is, calls THIS file— before and after each request. Auth is what that
 * door is built on, so it cannot go through it: login does not carry a token
 * and refresh is what a 401 would retry. The types still come from the
 * contract; only the paths are spelled out.
 */
const AUTH = {
  login: '/api/v2/auth/login',
  register: '/api/v2/auth/register',
  refresh: '/api/v2/auth/refresh',
  logout: '/api/v2/auth/logout',
  logoutAll: '/api/v2/auth/logout-all',
  changePassword: '/api/v2/auth/change-password',
} as const;

/**
 * The client's session state.
 *
 * It lives outside React on purpose: the API client needs the access token on
 * every call, and cannot depend on being inside a component.
 * `auth-context.tsx` is a thin React layer on top of this.
 *
 * ── Where the access token is kept ─────────────────────────────────────────
 * IN MEMORY. Neither localStorage nor sessionStorage: any XSS can read them
 * whole, and there a stolen token is worth 15 minutes of full access. In
 * memory, a page reload loses it — and that is fine: the refresh token lives
 * in an httpOnly cookie no JavaScript can read, and with it the session is
 * restored on startup.
 *
 * The price is one extra network round trip when the app loads. Cheap
 * compared with the alternative.
 *
 * ── And inside the phone app ────────────────────────────────────────────────
 * The embedded web has no refresh token: the app has it, in the keychain, and
 * it is the only one that rotates it. ONE function changes here —`renew()`—,
 * which instead of calling `/auth/refresh` asks the app for the access token
 * over the bridge (`bridge.ts`). Everything else —restoring, the timer, the
 * retry after a 401— already goes through `renew()`, so it is covered without
 * touching it. The functions that sign out tell the app what happened,
 * because the real session is the app's.
 */

/**
 * Margin before expiry to renew without anyone noticing.
 *
 * The phone app renews with a 120 s margin, on purpose more than these 60:
 * that way what the web receives over the bridge always has more than a
 * minute left, and `scheduleRenewal()` never falls into its 5 s minimum wait,
 * asking again and again for a token the app has not renewed yet.
 */
const RENEWAL_MARGIN_MS = 60_000;

export interface SessionState {
  user: Profile | null;
  /** `true` until the first attempt to restore the session finishes. */
  isLoading: boolean;
}

let accessToken: string | null = null;
let expiresAt = 0;
let user: Profile | null = null;
let isLoading = true;

let renewalTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Renewal in flight.
 *
 * CRITICAL: the backend rotates the refresh token on every use and detects
 * reuse —two calls with the same token revoke the whole session—. If three
 * requests got a 401 at once and each called /refresh, the second and the
 * third would look like a theft and sign the legitimate user out.
 * That is why they all share the SAME promise.
 */
let renewalInFlight: Promise<boolean> | null = null;

// ── Subscription ─────────────────────────────────────────────────────────────

const listeners = new Set<(state: SessionState) => void>();

export function subscribe(listener: (state: SessionState) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Snapshot of the state, STABLE between calls.
 *
 * Being the same object while nothing changes is not an efficiency detail:
 * `useSyncExternalStore` compares snapshots with `Object.is` to decide whether
 * to render again. Returning a freshly built `{ user, isLoading }` on every
 * call, React sees a different object on every render, believes the state
 * changed, renders again, asks for the snapshot again… and after a few cycles
 * aborts the whole tree.
 *
 * The symptom is a BLANK SCREEN without a single error on the server: the
 * HTML, the assets and the API all answer perfectly. It happened in production.
 */
let snapshot: SessionState = { user: null, isLoading: true };

export function currentState(): SessionState {
  return snapshot;
}

function notifyListeners(): void {
  // Built ONCE per real change, not once per read.
  snapshot = { user, isLoading };
  for (const listener of listeners) listener(snapshot);
}

// ── Token ────────────────────────────────────────────────────────────────────

export function currentToken(): string | null {
  return accessToken;
}

function storeSession(session: Session): void {
  accessToken = session.accessToken;
  expiresAt = Date.now() + session.expiresIn * 1000;
  user = session.user;
  isLoading = false;
  scheduleRenewal();
  notifyListeners();
}

function clearSession(): void {
  accessToken = null;
  expiresAt = 0;
  user = null;
  isLoading = false;
  if (renewalTimer) {
    clearTimeout(renewalTimer);
    renewalTimer = null;
  }
  notifyListeners();
}

/**
 * Renews BEFORE it expires, not once it has already failed.
 *
 * Reacting only to the 401 works, but it hands the user a failed request every
 * fifteen minutes —and with it a flicker or a visible retry—. Renewing a
 * minute early means that never happens in normal use.
 */
function scheduleRenewal(): void {
  if (renewalTimer) clearTimeout(renewalTimer);

  const delay = Math.max(expiresAt - Date.now() - RENEWAL_MARGIN_MS, 5_000);
  renewalTimer = setTimeout(() => {
    void renew();
  }, delay);
}

export function isTokenExpiring(): boolean {
  return accessToken !== null && Date.now() >= expiresAt - RENEWAL_MARGIN_MS;
}

// ── Operations ───────────────────────────────────────────────────────────────

/**
 * Calls the API without going through the authenticated client.
 *
 * `credentials: 'include'` is essential on /auth: it is what makes the
 * browser send and accept the httpOnly refresh cookie.
 */
async function callAuth<T>(
  url: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const response = await fetch(`${API_ORIGIN}${url}`, {
    method: options.method ?? 'POST',
    credentials: 'include',
    headers: options.body === undefined ? {} : { 'Content-Type': 'application/json' },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });

  if (response.status === 204) return undefined as T;

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const { code, message, details } = readProblem(body, t('errors.operationFailed'));
    throw new SessionError(response.status, code, message, details);
  }

  return (body as { data: T }).data;
}

/** Error of a session operation, with the API's stable `code`. */
export class SessionError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: ProblemFieldError[] = [],
  ) {
    super(message);
    this.name = 'SessionError';
  }
}

export async function signIn(email: string, password: string): Promise<void> {
  storeSession(await callAuth<Session>(AUTH.login, { body: { email, password } }));
}

export async function signUp(
  email: string,
  password: string,
  displayName: string,
): Promise<Registration> {
  return callAuth(AUTH.register, { body: { email, password, displayName } });
}

/**
 * Trades the refresh cookie for a new access token. Inside the app, it asks
 * the app for one over the bridge.
 *
 * Returns `false` —without throwing— when there is no session to restore,
 * because that is the normal case of someone opening the app without having
 * signed in.
 *
 * The `catch` does NOT tell the app. A bridge failure —network, timeout— says
 * nothing about the keychain, and reporting «session closed» because of a
 * network drop would make it delete a perfectly valid refresh. The web clears
 * its memory and `RequireAuth` waits for the app to push the session.
 */
export async function renew(): Promise<boolean> {
  renewalInFlight ??= (async () => {
    try {
      // Inside the SAME shared promise: two `renew()` at once are a single
      // message to the app, just as outside they are a single request.
      storeSession(
        isInNativeApp() ? await requestSession() : await callAuth<Session>(AUTH.refresh),
      );
      return true;
    } catch {
      clearSession();
      return false;
    } finally {
      renewalInFlight = null;
    }
  })();

  return renewalInFlight;
}

/** Called once when the app starts. */
export async function restore(): Promise<void> {
  await renew();
}

export async function signOut(): Promise<void> {
  // In the app, the real session is the app's: it calls `/auth/logout` with
  // its refresh and wipes the keychain. The web only tells it and forgets its
  // memory; calling from here as well would be a logout without a cookie that
  // closes nothing.
  if (isInNativeApp()) {
    notifyApp({ type: 'signOut' });
    clearSession();
    return;
  }

  try {
    await callAuth<unknown>(AUTH.logout);
  } finally {
    // Even if the server fails, the session closes locally: leaving the user
    // "inside" after pressing Sign out would be the worst of both worlds.
    clearSession();
  }
}

export async function signOutEverywhere(): Promise<void> {
  const response = await fetch(`${API_ORIGIN}${AUTH.logoutAll}`, {
    method: 'POST',
    credentials: 'include',
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
  });
  clearSession();
  // The server already killed the whole family, the keychain's included: the
  // app only has to discard it, without calling anything.
  if (isInNativeApp()) notifyApp({ type: 'sessionClosed' });
  if (!response.ok && response.status !== 401) {
    throw new SessionError(response.status, 'logout_all_failed', t('errors.signOutAllFailed'));
  }
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const response = await fetch(`${API_ORIGIN}${AUTH.changePassword}`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({ currentPassword, newPassword }),
  });

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const { code, message, details } = readProblem(body, t('errors.passwordChangeFailed'));
    throw new SessionError(response.status, code, message, details);
  }

  // Changing the password closes ALL sessions on the server, this one
  // included. Reflecting it here keeps the app from still believing it is
  // authenticated.
  clearSession();
  if (isInNativeApp()) notifyApp({ type: 'sessionClosed' });
}

/**
 * Closes the session locally without calling the server. For an unrecoverable 401.
 *
 * It does NOT tell the app: a 401 on a web call may be a token that expired
 * while the phone slept, and the app still has a good refresh with which to
 * push a new session.
 */
export function discardSession(): void {
  clearSession();
}

// ── What the app calls on the web (`window.__coco`) ─────────────────────────

/** The app pushes a session: on a start without one, or after the native login. */
export function receiveSession(session: BridgeSession): void {
  storeSession(session);
}

/** The app closed the real session (401 on renewal): the web forgets its own. */
export function sessionClosed(): void {
  clearSession();
}
