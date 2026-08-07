import type { ApiError, PerfilPublico, SesionResponse } from '@coco/types';

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
 */

const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api/v1';

/** Margen antes de la expiración para renovar sin que se note. */
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

function guardarSesion(sesion: SesionResponse): void {
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
 * Canjea la cookie de refresh por un access token nuevo.
 *
 * Devuelve `false` —sin lanzar— cuando no hay sesión que restaurar, porque ese
 * es el caso normal de alguien que abre la app sin haber entrado.
 */
export async function renovar(): Promise<boolean> {
  renovacionEnVuelo ??= (async () => {
    try {
      guardarSesion(await llamarAuth<SesionResponse>('/refresh'));
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
}

/** Cierra la sesión localmente sin llamar al servidor. Para un 401 irrecuperable. */
export function descartarSesion(): void {
  limpiarSesion();
}
