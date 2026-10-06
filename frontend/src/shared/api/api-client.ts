import { t } from '@/shared/lib/i18n';

import type { ProblemFieldError } from './generated/model';
import { API_ORIGIN } from './origin';
import { readProblem } from './problem';
import { discardSession, renew, currentToken, isTokenExpiring } from './session';

/**
 * An API error, already normalized. It carries the stable `code` the backend
 * guarantees, so the UI decides what to do without parsing messages.
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

  /** Account pending approval, or suspended. */
  get isForbidden(): boolean {
    return this.status === 403;
  }
}

/**
 * The one network door to the API, and the `mutator` of the generated client
 * (`orval.config.ts`): every function in `generated/` calls here with the URL
 * already built —`/api/v2/...`— and the `fetch` options.
 *
 * No component calls `fetch` on its own: if one did, sooner or later it would
 * forget to attach the token or to handle the error envelope, and those bugs
 * show up in production, not in development.
 *
 * The access token lasts 15 minutes and lives only in memory (see `session.ts`).
 * Two things happen here to make that invisible:
 *   1. If it is about to expire, it is renewed BEFORE going out to the network.
 *   2. If a 401 comes back anyway, it tries to renew ONCE and retries.
 *      Only once: if the second attempt fails too, the session really died,
 *      and retrying in a loop would only hide the problem.
 *
 * Returns the body as is —the `{ data, meta }` envelope—, a `Blob` if the
 * response is not JSON (a receipt), or nothing on a 204.
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
 * A binary from the API: a receipt, for example.
 *
 * ── Why putting the URL in an `<img>` is not enough ─────────────────────────
 * Because the session token lives in MEMORY, not in a cookie (see
 * `session.ts`), so a request the browser makes on its own —the one for a
 * `src`— goes out without an authorization header and the server rightly
 * rejects it. The file has to be requested from code, with the token, and
 * turned into a `blob:` the viewer can consume.
 *
 * That is not a detour: it is what lets the file NOT have a public URL that
 * works for whoever holds it.
 *
 * The caller is in charge of `URL.revokeObjectURL` when it is done, or the
 * blob stays in memory until the page reloads.
 */
export async function apiBlob(url: string, signal?: AbortSignal): Promise<Blob> {
  const response = await withSession(url, signal === undefined ? {} : { signal });

  // The body of an error IS JSON even when the route returns binaries.
  if (!response.ok) throw await errorFrom(response, t('errors.fileOpenFailed'));

  return response.blob();
}

/**
 * Uploads files: `multipart/form-data` with the session token.
 *
 * ── Why it does not go through `apiRequest` ─────────────────────────────────
 * Because of progress. `fetch` still cannot report the progress of an
 * UPLOAD —what it offers is for downloads— and here it is needed: a phone
 * photo takes a while, and a bar that does not move is indistinguishable from
 * a frozen app. So XMLHttpRequest, and it is the only time in the whole app.
 *
 * The `FormData` is handed to the browser AS IS: the browser is the one that
 * invents the boundary between the parts and writes it into `Content-Type`.
 * Setting that header by hand —even the right one— breaks the request,
 * because the boundary it declares is not the one the body carries.
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

/** Goes out to the network with the token, renewing it first if needed and once after a 401. */
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
