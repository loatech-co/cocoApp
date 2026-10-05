/**
 * Where the API is. Empty —the normal case— means the page's own origin: the
 * paths of the generated client already carry their `/api/v2`. Locally it
 * points at the development server (`frontend/.env.example`).
 *
 * Same origin in production is not a convenience: the refresh cookie is
 * `SameSite=Strict` and only travels as a first-party cookie.
 */
export const API_ORIGIN = (import.meta.env.VITE_API_ORIGIN as string | undefined) ?? '';
