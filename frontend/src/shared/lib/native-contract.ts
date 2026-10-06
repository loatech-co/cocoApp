/**
 * What the iPhone app and the web agree on OUTSIDE the generated client.
 *
 * Everything that is plain API contract comes from `shared/api/generated/`
 * (Orval, from `api/openapi.v2.json`). What lives here is not in that
 * document: the bridge of the web embedded in the app, the app's mark in the
 * User-Agent, and the v1 contract the app still speaks (the app moves to v2 in
 * its own step, and this file changes with it).
 *
 * It used to be `packages/types/src/index.ts`. Two tests read THIS file by
 * path, so names and literals below are load-bearing:
 *   - `api/src/modules/soportes/soportes.contrato.spec.ts` and
 *     `api/src/modules/interpretacion/interpretacion.contrato.spec.ts`;
 *   - `ios/CocoTests/Core/Networking/ContractsTests.swift` (`USER_AGENT_APP`).
 */

// ─── The web EMBEDDED in the app ─────────────────────────────────────────────

/**
 * The mark the app puts in the `WKWebView` User-Agent
 * (`applicationNameForUserAgent`), followed by its version: `CocoiOS/0.1.0`.
 * The web looks for it to know it runs inside the app; alone it is not enough
 * —a UA can be faked—, so the bridge is required too (`MensajeAlPuente`).
 */
export const USER_AGENT_APP = 'CocoiOS/';

/** The profile as the bridge delivers it: v1 shape, snake_case. */
interface BridgeProfile {
  id: number;
  email: string;
  display_name: string | null;
  role: 'admin' | 'user';
  status: 'pending' | 'active' | 'suspended';
  created_at: string;
}

/**
 * What the embedded web gets from the app instead of calling `/auth/refresh`.
 *
 * It is the v1 session (`access_token`, `expires_in`, `user`) and stays so
 * until the app moves to v2: the bridge changes when BOTH sides are ready.
 * The web translates it at the edge (`shared/api/session.ts`).
 *
 * ── Why it carries no `refresh_token` ───────────────────────────────────────
 * There is ONE refresh family per device and the app (keychain) owns it. The
 * token rotates on every use and reuse is detected: two rotators over the same
 * family would kill it. The web asks for an access token over the bridge,
 * keeps it in memory, and never sees a long-lived credential.
 */
export interface SesionParaLaWeb {
  access_token: string;
  /** Seconds the access token lives. */
  expires_in: number;
  user: BridgeProfile;
}

/** Web → app, with a reply (`WKScriptMessageHandlerWithReply`). */
export interface MensajeAlPuente {
  tipo: 'pedirSesion';
}

/**
 * Web → app, no reply.
 *
 * `salir`: the person signed out on the web; the app closes the real session
 * with its refresh. `sesionCerrada`: the web closed it server-side (password
 * change, sign out everywhere); the app drops the keychain without calling
 * anything. `sinSesion`: the web started without a session and waits for the
 * app to push one. `abrirCaptura`: open the native quick form.
 */
export interface EventoAlPuente {
  tipo: 'salir' | 'sesionCerrada' | 'sinSesion' | 'abrirCaptura';
}

// ─── The v1 contract the app still speaks ────────────────────────────────────

/**
 * How a native client identifies itself to `/auth/login|refresh|logout` in v1
 * (v2: `x-coco-client: native`). The web never sends it.
 * @public read by `ios/CocoTests/ContratosTests.swift`
 */
export const CABECERA_CLIENTE_NATIVO = 'x-coco-cliente';

/**
 * The receipts upload as the app does it (v1). The web uploads through v2,
 * where the field is `files` (generated `soportesUpload`), with the same
 * limits.
 *
 * Recommended size is what the web does before uploading
 * (`shared/lib/encoger-soporte.ts`): longest side 1600 px, JPEG at 0.85.
 * @public read by `soportes.contrato.spec.ts` (api) and `ContratosTests.swift`
 */
export const CONTRATO_DE_SOPORTES = {
  endpoint: 'POST /transactions/:id/soportes',
  /** `multipart/form-data`, and this is the field name. Several files, same name. */
  campo: 'archivos',
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

/**
 * What the app sends to `POST /transactions/interpret` in v1: free text (OCR,
 * SMS) or already-split data (the Wallet trigger). At least one.
 * @public read by `interpretacion.contrato.spec.ts` (api)
 */
export interface InterpretacionRequest {
  texto?: string;
  comercio?: string;
  /** Pesos, up to two decimals, as a string. */
  monto?: string;
  /** `YYYY-MM-DD`. */
  fecha?: string;
  nombre_de_archivo?: string;
  /** `YYYY-MM`. */
  periodo?: string;
}

/**
 * What the app sends to `POST /transactions/capture` in v1. Mirror of
 * `CaptureBodyDto`; `interpretacion.contrato.spec.ts` fails if they drift.
 * @public read by `interpretacion.contrato.spec.ts` (api)
 */
export interface CapturaRequest extends InterpretacionRequest {
  source: 'web' | 'ios_manual' | 'ios_photo' | 'wallet' | 'sms';
  /** The idempotency key: a UUID generated when capturing. */
  external_ref: string;
  /** ISO 8601 with zone. Now, without it. */
  captured_at?: string;
  /** The concept (or category) chosen by hand, as a numeric string. */
  category_id?: string;
  nota?: string;
}
