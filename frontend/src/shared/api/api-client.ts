import { t } from '@/shared/lib/i18n';

import type { ProblemFieldError } from './generated/model';
import { API_ORIGIN } from './origin';
import { readProblem } from './problem';
import { discardSession, renew, currentToken, isTokenExpiring } from './session';

/**
 * Error de API ya normalizado. Trae el `code` estable que el backend garantiza,
 * para que la UI decida qué hacer sin parsear mensajes.
 */
export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: ProblemFieldError[] = [],
  ) {
    super(message);
    this.name = 'ApiClientError';
  }

  get isUnauthenticated(): boolean {
    return this.status === 401;
  }

  /** Cuenta pendiente de aprobación o suspendida. */
  get isForbidden(): boolean {
    return this.status === 403;
  }
}

/**
 * Única puerta de red hacia la API, y el `mutator` del cliente generado
 * (`orval.config.ts`): cada función de `generated/` llama aquí con la URL ya
 * armada —`/api/v2/...`— y las opciones de `fetch`.
 *
 * Ningún componente hace `fetch` por su cuenta: si lo hiciera, tarde o temprano
 * se le olvidaría adjuntar el token o manejar el envelope de error, y esos bugs
 * aparecen en producción, no en desarrollo.
 *
 * El access token dura 15 minutos y vive solo en memoria (ver `session.ts`).
 * Aquí se hacen dos cosas para que eso sea invisible:
 *   1. Si está por expirar, se renueva ANTES de salir a la red.
 *   2. Si aun así vuelve un 401, se intenta renovar UNA vez y se reintenta.
 *      Una sola vez: si el segundo intento también falla, la sesión murió de
 *      verdad y reintentar en bucle solo escondería el problema.
 *
 * Devuelve el cuerpo tal cual —el envelope `{ data, meta }`—, un `Blob` si la
 * respuesta no es JSON (un soporte), o nada si es un 204.
 */
export async function apiRequest<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await withSession(url, init);

  if (response.status === 204) return undefined as T;

  if (!response.ok) throw await errorFrom(response, t('errors.operationFailed'));

  const contentType = response.headers.get('Content-Type') ?? '';
  if (!contentType.includes('json')) return (await response.blob()) as T;
  return (await response.json()) as T;
}

/**
 * Un binario de la API: un recibo, por ejemplo.
 *
 * ── Por qué no basta con poner la URL en un `<img>` ─────────────────────────
 * Porque el token de sesión vive en MEMORIA, no en una cookie (ver
 * `session.ts`), así que una petición que hace el navegador por su cuenta
 * —la de un `src`— sale sin cabecera de autorización y el servidor la rechaza
 * con razón. El archivo hay que pedirlo desde el código, con el token, y
 * convertirlo en un `blob:` que el visor sí puede consumir.
 *
 * Eso no es un rodeo: es lo que permite que el archivo NO tenga una URL
 * pública que funcione para quien la tenga.
 *
 * Quien llama se encarga de `URL.revokeObjectURL` cuando termina, o el blob se
 * queda en memoria hasta que se recargue la página.
 */
export async function apiBlob(url: string, signal?: AbortSignal): Promise<Blob> {
  const response = await withSession(url, signal === undefined ? {} : { signal });

  // El cuerpo de un error SÍ es JSON aunque la ruta devuelva binarios.
  if (!response.ok) throw await errorFrom(response, t('errors.fileOpenFailed'));

  return response.blob();
}

/**
 * Sube archivos: `multipart/form-data` con el token de la sesión.
 *
 * ── Por qué no pasa por `apiRequest` ────────────────────────────────────────
 * Por el progreso. `fetch` todavía no sabe informar del progreso de una
 * SUBIDA —lo que trae es para la descarga— y aquí hace falta: una foto de
 * móvil tarda lo suyo, y una barra quieta es indistinguible de una aplicación
 * colgada. Así que XMLHttpRequest, y es la única vez en toda la aplicación.
 *
 * El `FormData` se entrega al navegador TAL CUAL: es él quien inventa la
 * frontera entre las partes y la escribe en el `Content-Type`. Poner esa
 * cabecera a mano —aunque sea la correcta— rompe la petición, porque la
 * frontera que se declara no es la que el cuerpo lleva dentro.
 */
export async function apiUpload<TData>(
  url: string,
  data: FormData,
  onProgress?: (fraction: number) => void,
): Promise<TData> {
  if (isTokenExpiring()) await renew();

  return new Promise<TData>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', `${API_ORIGIN}${url}`);

    const token = currentToken();
    if (token) request.setRequestHeader('Authorization', `Bearer ${token}`);

    request.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    };

    request.onload = () => {
      const body: unknown = ((): unknown => {
        try {
          return JSON.parse(request.responseText);
        } catch {
          return null;
        }
      })();

      if (request.status >= 200 && request.status < 300) {
        resolve((body as { data: TData }).data);
        return;
      }

      if (request.status === 401) discardSession();
      reject(errorFromBody(request.status, body, t('errors.uploadFailed')));
    };

    request.onerror = () => reject(new ApiClientError(0, 'network_error', t('errors.offline')));

    request.send(data);
  });
}

/** Sale a la red con el token, renovándolo antes si hace falta y una vez tras un 401. */
async function withSession(url: string, init: RequestInit): Promise<Response> {
  if (isTokenExpiring()) await renew();

  let response = await send(url, init);

  if (response.status === 401) {
    const wasRenewed = await renew();
    if (!wasRenewed) {
      discardSession();
      throw new ApiClientError(401, 'unauthenticated', t('errors.sessionExpired'));
    }
    response = await send(url, init);
  }

  return response;
}

async function errorFrom(response: Response, fallback: string): Promise<ApiClientError> {
  const body: unknown = await response.json().catch(() => null);
  if (response.status === 401) discardSession();
  return errorFromBody(response.status, body, fallback);
}

function errorFromBody(status: number, body: unknown, fallback: string): ApiClientError {
  const { code, message, details } = readProblem(body, fallback);
  return new ApiClientError(status, code, message, details);
}

function send(url: string, init: RequestInit): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = currentToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  return fetch(`${API_ORIGIN}${url}`, { ...init, headers });
}
