import type { ApiError, ApiResponse } from '@coco/types';
import { getIdToken } from 'firebase/auth';
import { auth } from './firebase';

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
 * El token se pide fresco en CADA llamada: `getIdToken` lo renueva solo cuando
 * está por expirar (dura ~1 hora), así que no hay que gestionar refrescos a mano.
 */
export async function apiFetch<TData, TMeta = Record<string, unknown>>(
  path: string,
  options: RequestOptions = {},
): Promise<ApiResponse<TData, TMeta>> {
  const { method = 'GET', body, idempotencyKey, signal } = options;

  const user = auth.currentUser;
  if (!user) {
    throw new ApiClientError(401, 'unauthenticated', 'No hay una sesión activa.');
  }

  const token = await getIdToken(user);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (idempotencyKey) {
    headers['Idempotency-Key'] = idempotencyKey;
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });

  if (response.status === 204) {
    return { data: undefined as TData, meta: {} as TMeta };
  }

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const error = (payload as ApiError | null)?.error;
    throw new ApiClientError(
      response.status,
      error?.code ?? 'unknown_error',
      error?.message ?? 'No se pudo completar la operación.',
      error?.details ?? [],
    );
  }

  return payload as ApiResponse<TData, TMeta>;
}
