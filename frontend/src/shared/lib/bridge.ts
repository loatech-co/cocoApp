import { t } from '@/shared/lib/i18n';
import {
  USER_AGENT_APP,
  type AppNotices,
  type BridgeEvent,
  type BridgeMessage,
  type BridgeSession,
} from '@/shared/lib/native-contract';

/**
 * The bridge with the phone app.
 *
 * ── The only place that knows `window.webkit` ───────────────────────────────
 * The web embedded in the `WKWebView` has no refresh token: there is ONE
 * refresh family per device and its only owner is the app, in the keychain.
 * When the web needs a session it ASKS the app for one here, and the app
 * answers with an access token the web keeps in memory exactly as in Safari.
 * Nothing travels in the URL, in cookies or over the network: the message
 * goes inside the webview's process.
 *
 * Everything that talks to the app goes through this file. If tomorrow the
 * bridge changes name or shape, it is touched here and nowhere else: `session`
 * only knows there is a `requestSession()`, and the shell only that there is
 * a `registerBridge()`.
 *
 * ── Two signals, not one ────────────────────────────────────────────────────
 * A `User-Agent` can be faked with a browser extension. With that signal alone
 * the normal web would stop renewing by cookie and sit waiting for an app that
 * does not exist. That is why `isInNativeApp()` also requires the bridge to BE
 * there: `window.webkit.messageHandlers.cocoSession.postMessage` has to be a
 * function. One without the other is not the app.
 *
 * ── What the app calls on the web ───────────────────────────────────────────
 * `registerBridge` lives in
 * `shared/api/native-bridge.ts`: it needs `session`, and `session` needs
 * this file.
 */

/**
 * What the app can call from Swift (`evaluateJavaScript`). The notices
 * without an answer (`captured`, `foreground`) are a contract with iOS and
 * live in `native-contract.ts`.
 */
interface WebBridge extends AppNotices {
  /** Navigates without reloading: `react-router` changes the route inside. */
  navigate(path: string): void;
  /** Opens the search sheet. The native «Buscar» tab calls here. */
  openSearch(): void;
  /** The app pushes a session: on a start without one, or after the native login. */
  receiveSession(session: BridgeSession): void;
  /** The app closed the real session (401 on renewal): the web clears its memory. */
  sessionClosed(): void;
}

/*
  The `window.webkit` declaration lives HERE and in no other file. It is
  optional from top to bottom because in Safari, in Chrome and in the tests
  none of this exists, and the code has to be able to ask without breaking.
*/
declare global {
  interface Window {
    webkit?: {
      messageHandlers?: {
        /** With an answer (`WKScriptMessageHandlerWithReply`). */
        cocoSession?: { postMessage(message: BridgeMessage): Promise<unknown> };
        /** Without an answer (`WKScriptMessageHandler`). */
        cocoEvents?: { postMessage(event: BridgeEvent): void };
      };
    };
    __coco?: WebBridge;
  }
}

/**
 * How long to wait for the app before giving up.
 *
 * The app answers at once if it has the token in memory, and in whatever
 * `/auth/refresh` takes if not. Ten seconds cover a bad network; more than
 * that is a frozen app, and the web cannot sit there drawing nothing meanwhile.
 */
const TIMEOUT_MS = 10_000;

/** Why the bridge failed. `reason` is stable; the message is for the log. */
export class BridgeError extends Error {
  constructor(
    readonly reason: 'no-bridge' | 'timeout' | 'no-session' | 'bad-response',
    message = t('errors.bridge.noSession'),
  ) {
    super(message);
    this.name = 'BridgeError';
  }
}

/** Whether this web runs INSIDE the phone app. See «two signals». */
export function isInNativeApp(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  return (
    navigator.userAgent.includes(USER_AGENT_APP) &&
    typeof window.webkit?.messageHandlers?.cocoSession?.postMessage === 'function'
  );
}

function isBridgeSession(value: unknown): value is BridgeSession {
  if (typeof value !== 'object' || value === null) return false;
  const session = value as Record<string, unknown>;
  return (
    typeof session.accessToken === 'string' &&
    typeof session.expiresIn === 'number' &&
    typeof session.user === 'object' &&
    session.user !== null
  );
}

/**
 * Asks the app for an access token.
 *
 * Rejects with `BridgeError` if there is no bridge, if the app does not answer
 * within `TIMEOUT_MS`, if it answers that it has no session, or if it answers
 * something that is not a session. The caller —`session.renew()`— treats any
 * rejection the same way: it clears the memory and lets `RequireAuth` wait for
 * the app to push one. What it NEVER does is tell the app to wipe its keychain.
 */
export function requestSession(): Promise<BridgeSession> {
  const handler = window.webkit?.messageHandlers?.cocoSession;
  if (!handler) return Promise.reject(new BridgeError('no-bridge', t('errors.bridge.missing')));

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new BridgeError('timeout', t('errors.bridge.timeout'))),
      TIMEOUT_MS,
    );
  });

  const response = Promise.resolve()
    // Inside the `then` so that a `postMessage` that throws synchronously
    // ends up as a rejection and not as an exception outside the promise.
    .then(() => handler.postMessage({ type: 'requestSession' }))
    .then(
      (value) => {
        if (!isBridgeSession(value)) {
          throw new BridgeError('bad-response', t('errors.bridge.notASession'));
        }
        return value;
      },
      (cause: unknown) => {
        // `WKScriptMessageHandlerWithReply` rejects with the error's text;
        // depending on the WebKit version it arrives bare or wrapped in an `Error`.
        const detail =
          cause instanceof Error ? cause.message : typeof cause === 'string' ? cause : undefined;
        throw new BridgeError('no-session', detail);
      },
    );

  return Promise.race([response, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Tells the app something, without waiting for an answer.
 *
 * Outside the app there is nobody to tell and nothing happens: the caller
 * already asked `isInNativeApp()`, and if it did not, there is no reason to
 * break the web for a notice that has no recipient.
 */
export function notifyApp(event: BridgeEvent): void {
  window.webkit?.messageHandlers?.cocoEvents?.postMessage(event);
}
