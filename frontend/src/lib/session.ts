import type { ApiError, PerfilPublico, SesionParaLaWeb, SesionResponse } from '@coco/types';

import { avisar as avisarALaApp, enLaApp, pedirSesion } from './puente-nativo';

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

const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api/v1';

/**
 * Margen antes de la expiración para renovar sin que se note.
 *
 * La app del teléfono renueva con 120 s de margen, a propósito más que estos
 * 60: así lo que la web recibe por el puente siempre tiene más de un minuto
 * de vida y `programarRenovacion()` nunca cae en su espera mínima de 5 s
 * pidiendo una y otra vez un token que la app aún no ha renovado.
 */
const MARGEN_DE_RENOVACION_MS = 60_000;

export interface EstadoDeSesion {
  usuario: PerfilPublico | null;
  /** `true` hasta que el primer intento de restaurar la sesión termina. */
  cargando: boolean;
}

let accessToken: string | null = null;
let expiraEn = 0;
let usuario: PerfilPublico | null = null;
let cargando = true;

let temporizador: ReturnType<typeof setTimeout> | null = null;

/**
 * Renovación en vuelo.
 *
 * CRÍTICO: el backend rota el refresh token en cada uso y detecta reusos —dos
 * llamadas con el mismo token revocan la sesión entera—. Si tres peticiones
 * recibieran 401 a la vez y cada una llamara a /refresh, la segunda y la
 * tercera parecerían un robo y cerrarían la sesión del usuario legítimo.
 * Por eso todas comparten la MISMA promesa.
 */
let renovacionEnVuelo: Promise<boolean> | null = null;

// ── Suscripción ──────────────────────────────────────────────────────────────

const oyentes = new Set<(estado: EstadoDeSesion) => void>();

export function suscribirse(oyente: (estado: EstadoDeSesion) => void): () => void {
  oyentes.add(oyente);
  return () => {
    oyentes.delete(oyente);
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
let instantanea: EstadoDeSesion = { usuario: null, cargando: true };

export function estadoActual(): EstadoDeSesion {
  return instantanea;
}

function avisar(): void {
  // Se construye UNA vez por cambio real, no una por lectura.
  instantanea = { usuario, cargando };
  for (const oyente of oyentes) oyente(instantanea);
}

// ── Token ────────────────────────────────────────────────────────────────────

export function tokenActual(): string | null {
  return accessToken;
}

function guardarSesion(sesion: SesionParaLaWeb): void {
  accessToken = sesion.access_token;
  expiraEn = Date.now() + sesion.expires_in * 1000;
  usuario = sesion.user;
  cargando = false;
  programarRenovacion();
  avisar();
}

function limpiarSesion(): void {
  accessToken = null;
  expiraEn = 0;
  usuario = null;
  cargando = false;
  if (temporizador) {
    clearTimeout(temporizador);
    temporizador = null;
  }
  avisar();
}

/**
 * Renueva ANTES de que expire, no cuando ya falló.
 *
 * Reaccionar solo al 401 funciona, pero le regala al usuario una petición
 * fallida cada quince minutos —y con ella un parpadeo o un reintento visible—.
 * Renovar un minuto antes hace que eso no ocurra nunca en uso normal.
 */
function programarRenovacion(): void {
  if (temporizador) clearTimeout(temporizador);

  const espera = Math.max(expiraEn - Date.now() - MARGEN_DE_RENOVACION_MS, 5_000);
  temporizador = setTimeout(() => {
    void renovar();
  }, espera);
}

export function tokenPorExpirar(): boolean {
  return accessToken !== null && Date.now() >= expiraEn - MARGEN_DE_RENOVACION_MS;
}

// ── Operaciones ──────────────────────────────────────────────────────────────

/**
 * Llama a la API sin pasar por el cliente autenticado.
 *
 * `credentials: 'include'` es imprescindible en /auth: es lo que hace que el
 * navegador envíe y acepte la cookie httpOnly de refresh.
 */
async function llamarAuth<T>(
  ruta: string,
  opciones: { method?: string; body?: unknown } = {},
): Promise<T> {
  const respuesta = await fetch(`${BASE_URL}/auth${ruta}`, {
    method: opciones.method ?? 'POST',
    credentials: 'include',
    headers: opciones.body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body),
  });

  if (respuesta.status === 204) return undefined as T;

  const cuerpo: unknown = await respuesta.json().catch(() => null);

  if (!respuesta.ok) {
    const error = (cuerpo as ApiError | null)?.error;
    throw new SesionError(
      respuesta.status,
      error?.code ?? 'unknown_error',
      error?.message ?? 'No se pudo completar la operación.',
      error?.details ?? [],
    );
  }

  return (cuerpo as { data: T }).data;
}

/** Error de una operación de sesión, con el `code` estable de la API. */
export class SesionError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: ApiError['error']['details'] = [],
  ) {
    super(message);
    this.name = 'SesionError';
  }
}

export async function entrar(email: string, password: string): Promise<void> {
  guardarSesion(await llamarAuth<SesionResponse>('/login', { body: { email, password } }));
}

export async function registrarse(
  email: string,
  password: string,
  displayName: string,
): Promise<{ pending_approval: boolean; message: string }> {
  return llamarAuth('/register', { body: { email, password, displayName } });
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
export async function renovar(): Promise<boolean> {
  renovacionEnVuelo ??= (async () => {
    try {
      // Dentro de la MISMA promesa compartida: dos `renovar()` a la vez son
      // un solo mensaje a la app, igual que fuera son una sola petición.
      guardarSesion(
        enLaApp() ? await pedirSesion() : await llamarAuth<SesionResponse>('/refresh'),
      );
      return true;
    } catch {
      limpiarSesion();
      return false;
    } finally {
      renovacionEnVuelo = null;
    }
  })();

  return renovacionEnVuelo;
}

/** Se llama una vez al arrancar la app. */
export async function restaurar(): Promise<void> {
  await renovar();
}

export async function salir(): Promise<void> {
  // En la app, la sesión real es la suya: ella llama a `/auth/logout` con su
  // refresh y borra el llavero. La web solo avisa y olvida su memoria; llamar
  // además desde aquí sería un logout sin cookie que no cierra nada.
  if (enLaApp()) {
    avisarALaApp({ tipo: 'salir' });
    limpiarSesion();
    return;
  }

  try {
    await llamarAuth<void>('/logout');
  } finally {
    // Aunque el servidor falle, localmente la sesión se cierra: dejar al
    // usuario "dentro" tras pulsar Salir sería lo peor de los dos mundos.
    limpiarSesion();
  }
}

export async function salirDeTodosLosDispositivos(): Promise<void> {
  const respuesta = await fetch(`${BASE_URL}/auth/logout-all`, {
    method: 'POST',
    credentials: 'include',
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
  });
  limpiarSesion();
  // El servidor ya mató la familia entera, incluida la del llavero: la app
  // solo tiene que descartarlo, sin llamar a nada.
  if (enLaApp()) avisarALaApp({ tipo: 'sesionCerrada' });
  if (!respuesta.ok && respuesta.status !== 401) {
    throw new SesionError(respuesta.status, 'logout_all_failed', 'No se pudo cerrar todo.');
  }
}

export async function cambiarContrasena(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const respuesta = await fetch(`${BASE_URL}/auth/change-password`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({ currentPassword, newPassword }),
  });

  if (!respuesta.ok) {
    const cuerpo: unknown = await respuesta.json().catch(() => null);
    const error = (cuerpo as ApiError | null)?.error;
    throw new SesionError(
      respuesta.status,
      error?.code ?? 'unknown_error',
      error?.message ?? 'No se pudo cambiar la contraseña.',
      error?.details ?? [],
    );
  }

  // Cambiar la contraseña cierra TODAS las sesiones en el servidor, incluida
  // esta. Reflejarlo aquí evita que la app siga creyéndose autenticada.
  limpiarSesion();
  if (enLaApp()) avisarALaApp({ tipo: 'sesionCerrada' });
}

/**
 * Cierra la sesión localmente sin llamar al servidor. Para un 401 irrecuperable.
 *
 * NO avisa a la app: un 401 en una llamada de la web puede ser un token que
 * caducó mientras el teléfono dormía, y la app sigue teniendo un refresh
 * bueno con el que empujar una sesión nueva.
 */
export function descartarSesion(): void {
  limpiarSesion();
}

// ── Lo que la app llama hacia la web (`window.__coco`) ──────────────────────

/** La app empuja una sesión: al arrancar sin ella, o tras el login nativo. */
export function recibirSesion(sesion: SesionParaLaWeb): void {
  guardarSesion(sesion);
}

/** La app cerró la sesión real (401 al renovar): la web olvida la suya. */
export function sesionCerrada(): void {
  limpiarSesion();
}
