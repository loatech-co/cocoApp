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
 * Estado de sesión del cliente.
 *
 * Vive fuera de React a propósito: el cliente de API necesita el access token
 * en cada llamada, y no puede depender de estar dentro de un componente.
 * `auth-context.tsx` es una capa fina de React encima de esto.
 *
 * ── Dónde se guarda el access token ────────────────────────────────────────
 * EN MEMORIA. Ni localStorage ni sessionStorage: cualquier XSS puede leerlos
 * enteros, y ahí un token robado vale por 15 minutos de acceso completo. En
 * memoria, un recarga de página lo pierde — y eso está bien: el refresh token
 * vive en una cookie httpOnly que ningún JavaScript puede leer, y con ella se
 * restaura la sesión al arrancar.
 *
 * El precio es un viaje de red extra al cargar la app. Es barato comparado con
 * la alternativa.
 *
 * ── Y dentro de la app del teléfono ─────────────────────────────────────────
 * La web embebida no tiene refresh token: lo tiene la app, en el llavero, y
 * es la única que lo rota. Aquí cambia UNA función —`renovar()`—, que en vez
 * de llamar a `/auth/refresh` le pide el access token a la app por el puente
 * (`puente-nativo.ts`). Todo lo demás —restaurar, el temporizador, el
 * reintento tras un 401— ya pasa por `renovar()`, así que queda cubierto sin
 * tocarlo. Las funciones que cierran sesión le cuentan a la app lo que pasó,
 * porque la sesión real es la suya.
 */

/**
 * Margen antes de la expiración para renovar sin que se note.
 *
 * La app del teléfono renueva con 120 s de margen, a propósito más que estos
 * 60: así lo que la web recibe por el puente siempre tiene más de un minuto
 * de vida y `programarRenovacion()` nunca cae en su espera mínima de 5 s
 * pidiendo una y otra vez un token que la app aún no ha renovado.
 */
const RENEWAL_MARGIN_MS = 60_000;

export interface SessionState {
  user: Profile | null;
  /** `true` hasta que el primer intento de restaurar la sesión termina. */
  isLoading: boolean;
}

let accessToken: string | null = null;
let expiresAt = 0;
let user: Profile | null = null;
let isLoading = true;

let renewalTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Renovación en vuelo.
 *
 * CRÍTICO: el backend rota el refresh token en cada uso y detecta reusos —dos
 * llamadas con el mismo token revocan la sesión entera—. Si tres peticiones
 * recibieran 401 a la vez y cada una llamara a /refresh, la segunda y la
 * tercera parecerían un robo y cerrarían la sesión del usuario legítimo.
 * Por eso todas comparten la MISMA promesa.
 */
let renewalInFlight: Promise<boolean> | null = null;

// ── Suscripción ──────────────────────────────────────────────────────────────

const listeners = new Set<(state: SessionState) => void>();

export function subscribe(listener: (state: SessionState) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Instantánea del estado, ESTABLE entre llamadas.
 *
 * Que sea el mismo objeto mientras nada cambie no es un detalle de eficiencia:
 * `useSyncExternalStore` compara instantáneas con `Object.is` para decidir si
 * hay que volver a pintar. Devolviendo `{ usuario, cargando }` recién creado en
 * cada llamada, React ve un objeto distinto en cada render, cree que el estado
 * cambió, vuelve a pintar, vuelve a pedir la instantánea… y a los pocos ciclos
 * aborta el árbol entero.
 *
 * El síntoma es una PANTALLA EN BLANCO sin un solo error en el servidor: el
 * HTML, los assets y la API responden perfectamente. Pasó en producción.
 */
let snapshot: SessionState = { user: null, isLoading: true };

export function currentState(): SessionState {
  return snapshot;
}

function notifyListeners(): void {
  // Se construye UNA vez por cambio real, no una por lectura.
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
 * Renueva ANTES de que expire, no cuando ya falló.
 *
 * Reaccionar solo al 401 funciona, pero le regala al usuario una petición
 * fallida cada quince minutos —y con ella un parpadeo o un reintento visible—.
 * Renovar un minuto antes hace que eso no ocurra nunca en uso normal.
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

// ── Operaciones ──────────────────────────────────────────────────────────────

/**
 * Llama a la API sin pasar por el cliente autenticado.
 *
 * `credentials: 'include'` es imprescindible en /auth: es lo que hace que el
 * navegador envíe y acepte la cookie httpOnly de refresh.
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

/** Error de una operación de sesión, con el `code` estable de la API. */
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
 * Canjea la cookie de refresh por un access token nuevo. Dentro de la app, se
 * lo pide a ella por el puente.
 *
 * Devuelve `false` —sin lanzar— cuando no hay sesión que restaurar, porque ese
 * es el caso normal de alguien que abre la app sin haber entrado.
 *
 * El `catch` NO avisa a la app. Un fallo del puente —red, tiempo— no dice
 * nada sobre el llavero, y avisar «sesión cerrada» por un corte de red le
 * haría borrar un refresh perfectamente válido. La web limpia su memoria y
 * `RequireAuth` espera a que la app le empuje la sesión.
 */
export async function renew(): Promise<boolean> {
  renewalInFlight ??= (async () => {
    try {
      // Dentro de la MISMA promesa compartida: dos `renovar()` a la vez son
      // un solo mensaje a la app, igual que fuera son una sola petición.
      storeSession(
        isInNativeApp()
          ? fromBridge(await requestSession())
          : await callAuth<Session>(AUTH.refresh),
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

/** Se llama una vez al arrancar la app. */
export async function restore(): Promise<void> {
  await renew();
}

export async function signOut(): Promise<void> {
  // En la app, la sesión real es la suya: ella llama a `/auth/logout` con su
  // refresh y borra el llavero. La web solo avisa y olvida su memoria; llamar
  // además desde aquí sería un logout sin cookie que no cierra nada.
  if (isInNativeApp()) {
    notifyApp({ tipo: 'salir' });
    clearSession();
    return;
  }

  try {
    await callAuth<unknown>(AUTH.logout);
  } finally {
    // Aunque el servidor falle, localmente la sesión se cierra: dejar al
    // usuario "dentro" tras pulsar Salir sería lo peor de los dos mundos.
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
  // El servidor ya mató la familia entera, incluida la del llavero: la app
  // solo tiene que descartarlo, sin llamar a nada.
  if (isInNativeApp()) notifyApp({ tipo: 'sesionCerrada' });
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

  // Cambiar la contraseña cierra TODAS las sesiones en el servidor, incluida
  // esta. Reflejarlo aquí evita que la app siga creyéndose autenticada.
  clearSession();
  if (isInNativeApp()) notifyApp({ tipo: 'sesionCerrada' });
}

/**
 * Cierra la sesión localmente sin llamar al servidor. Para un 401 irrecuperable.
 *
 * NO avisa a la app: un 401 en una llamada de la web puede ser un token que
 * caducó mientras el teléfono dormía, y la app sigue teniendo un refresh
 * bueno con el que empujar una sesión nueva.
 */
export function discardSession(): void {
  clearSession();
}

// ── Lo que la app llama hacia la web (`window.__coco`) ──────────────────────

/** La app empuja una sesión: al arrancar sin ella, o tras el login nativo. */
export function receiveSession(session: BridgeSession): void {
  storeSession(fromBridge(session));
}

/**
 * The bridge still speaks v1 (snake_case): it changes when the app moves to
 * v2, together with this function. Until then the web translates at the edge
 * and nothing inside it knows.
 */
function fromBridge(session: BridgeSession): Session {
  const { display_name, created_at, ...rest } = session.user;
  return {
    accessToken: session.access_token,
    expiresIn: session.expires_in,
    user: { ...rest, displayName: display_name, createdAt: created_at },
  };
}

/** La app cerró la sesión real (401 al renovar): la web olvida la suya. */
export function sessionClosed(): void {
  clearSession();
}
