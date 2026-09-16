import type { ApiError, ApiResponse } from '@coco/types';

import { descartarSesion, renovar, tokenActual, tokenPorExpirar } from './session';

const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api/v1';

/**
 * Error de API ya normalizado. Trae el `code` estable que el backend garantiza,
 * para que la UI decida qué hacer sin parsear mensajes.
 */
export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: ApiError['error']['details'] = [],
  ) {
    super(message);
    this.name = 'ApiClientError';
  }

  get esNoAutenticado(): boolean {
    return this.status === 401;
  }

  /** Cuenta pendiente de aprobación o suspendida. */
  get esSinPermiso(): boolean {
    return this.status === 403;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Para el commit de importación (Fase 2), que debe ser idempotente. */
  idempotencyKey?: string;
  signal?: AbortSignal;
}

/**
 * Única puerta de red hacia la API.
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
 */
export async function apiFetch<TData, TMeta = Record<string, unknown>>(
  path: string,
  options: RequestOptions = {},
): Promise<ApiResponse<TData, TMeta>> {
  if (tokenPorExpirar()) {
    await renovar();
  }

  let respuesta = await enviar(path, options);

  if (respuesta.status === 401) {
    const renovada = await renovar();
    if (!renovada) {
      descartarSesion();
      throw new ApiClientError(401, 'unauthenticated', 'Tu sesión expiró. Vuelve a entrar.');
    }
    respuesta = await enviar(path, options);
  }

  if (respuesta.status === 204) {
    return { data: undefined as TData, meta: {} as TMeta };
  }

  const payload: unknown = await respuesta.json().catch(() => null);

  if (!respuesta.ok) {
    const error = (payload as ApiError | null)?.error;
    if (respuesta.status === 401) descartarSesion();

    throw new ApiClientError(
      respuesta.status,
      error?.code ?? 'unknown_error',
      error?.message ?? 'No se pudo completar la operación.',
      error?.details ?? [],
    );
  }

  return payload as ApiResponse<TData, TMeta>;
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
export async function apiBlob(path: string, signal?: AbortSignal): Promise<Blob> {
  if (tokenPorExpirar()) {
    await renovar();
  }

  let respuesta = await enviar(path, { signal });

  if (respuesta.status === 401) {
    const renovada = await renovar();
    if (!renovada) {
      descartarSesion();
      throw new ApiClientError(401, 'unauthenticated', 'Tu sesión expiró. Vuelve a entrar.');
    }
    respuesta = await enviar(path, { signal });
  }

  if (!respuesta.ok) {
    // El cuerpo de un error SÍ es JSON aunque la ruta devuelva binarios.
    const payload: unknown = await respuesta.json().catch(() => null);
    const error = (payload as ApiError | null)?.error;
    if (respuesta.status === 401) descartarSesion();

    throw new ApiClientError(
      respuesta.status,
      error?.code ?? 'unknown_error',
      error?.message ?? 'No se pudo abrir el archivo.',
      error?.details ?? [],
    );
  }

  return respuesta.blob();
}

function enviar(path: string, options: RequestOptions): Promise<Response> {
  const { method = 'GET', body, idempotencyKey, signal } = options;
  const token = tokenActual();

  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

  return fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
}
