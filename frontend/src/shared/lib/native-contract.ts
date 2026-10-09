/**
 * What the iPhone app and the web agree on OUTSIDE the generated client.
 *
 * Everything that is plain API contract comes from `shared/api/generated/`
 * (Orval, from `api/openapi.v2.json`). What lives here is not in that
 * document: the bridge of the web embedded in the app, the app's mark in the
 * User-Agent, and the receipt limits both clients follow.
 *
 * It used to be `packages/types/src/index.ts`. Two tests read THIS file by
 * path, so names and literals below are load-bearing:
 *   - `api/src/modules/receipts/receipts.contract.spec.ts`;
 *   - `ios/CocoTests/Core/Networking/ContractsTests.swift` (`USER_AGENT_APP`).
 */

// ─── The web EMBEDDED in the app ─────────────────────────────────────────────

/**
 * The mark the app puts in the `WKWebView` User-Agent
 * (`applicationNameForUserAgent`), followed by its version: `CocoiOS/0.1.0`.
 * The web looks for it to know it runs inside the app; alone it is not enough
 * —a UA can be faked—, so the bridge is required too (`cocoSession`).
 */
export const USER_AGENT_APP = 'CocoiOS/';

/** The profile as the bridge delivers it: the v2 `Profile`, as the API gave it to the app. */
interface BridgeProfile {
  id: number;
  email: string;
  displayName: string | null;
  role: 'admin' | 'user';
  status: 'pending' | 'active' | 'suspended';
  createdAt: string;
}

/**
 * What the embedded web gets from the app instead of calling `/auth/refresh`.
 *
 * It is the v2 session (`accessToken`, `expiresIn`, `user`), as the API
 * hands it to the app; the web stores it as it comes (`shared/api/session.ts`).
 *
 * ── Why it carries no `refresh_token` ───────────────────────────────────────
 * There is ONE refresh family per device and the app (keychain) owns it. The
 * token rotates on every use and reuse is detected: two rotators over the same
 * family would kill it. The web asks for an access token over the bridge,
 * keeps it in memory, and never sees a long-lived credential.
 */
export interface BridgeSession {
  accessToken: string;
  /** Seconds the access token lives. */
  expiresIn: number;
  user: BridgeProfile;
}

/** Web → app, with a reply (`WKScriptMessageHandlerWithReply`). */
export interface BridgeMessage {
  type: 'requestSession';
}

/**
 * Web → app, no reply.
 *
 * `signOut`: the person signed out on the web; the app closes the real session
 * with its refresh. `sessionClosed`: the web closed it server-side (password
 * change, sign out everywhere); the app drops the keychain without calling
 * anything. `noSession`: the web started without a session and waits for the
 * app to push one. `openCapture`: open the native quick form.
 */
export interface BridgeEvent {
  type: 'signOut' | 'sessionClosed' | 'noSession' | 'openCapture';
}

/**
 * App → web, no reply: the app calls `window.__coco.<name>()` with
 * `evaluateJavaScript`, and only if `window.__coco` exists (there is no
 * `__coco` before there is a session, and then there is nothing to refresh).
 *
 * `captured`: a capture made in the app finished syncing (the API answered
 * 2xx). The web refetches movements, accounts and the summary, which are what
 * a new movement changes.
 * `foreground`: the app, or the tab that holds the web view, came back to the
 * foreground. A `WKWebView` gets no window focus, so without this the web
 * never refetches what went stale while it was hidden.
 */
export interface AppNotices {
  captured(): void;
  foreground(): void;
}

// ─── Receipts ────────────────────────────────────────────────────────────────

/**
 * The receipts upload, as both clients do it (generated `receiptsUpload` on
 * the web).
 *
 * Recommended size is what the web does before uploading
 * (`shared/lib/shrink-receipt.ts`): longest side 1600 px, JPEG at 0.85.
 * @public read by `receipts.contract.spec.ts` (api)
 */
export const CONTRATO_DE_SOPORTES = {
  endpoint: 'POST /api/v2/transactions/:id/receipts',
  /** `multipart/form-data`, and this is the field name. Several files, same name. */
  campo: 'files',
  maximo_por_subida: 10,
  /** Per file, in bytes. */
  tamano_maximo_bytes: 26214400,
  /** The only accepted types. A HEIC is converted first; an SVG never. */
  tipos: ['application/pdf', 'image/jpeg', 'image/png'],
  recomendado: {
    lado_maximo_px: 1600,
    formato: 'image/jpeg',
    calidad: 0.85,
  },
} as const;
