import type { NextFunction, Request, Response } from 'express';

/**
 * v1 is deprecated from the day v2 shipped (step 7.4) and stays until it has
 * gone seven days without a single use (7.10). Two things make that
 * countable and visible:
 *
 *   · every v1 response says so: `Deprecation` (RFC 9745, a structured-field
 *     date) and a `Link` to the same route in v2 (`rel="successor-version"`,
 *     RFC 5829), so a client — or whoever reads its traffic — knows where to go;
 *   · every v1 request leaves one structured log line, `msg: "v1_used"`, with
 *     the method and the route TEMPLATE. Ids become `:id` and the query string
 *     is dropped, so the line carries no personal data and lines group by route.
 *
 * No `Sunset` yet: the date depends on when the last client moves, which is
 * exactly what these lines measure.
 */

/** 2026-10-05, the day v2 was published, as RFC 9745 wants it: `@` + Unix seconds. */
export const V1_DEPRECATION = `@${Date.UTC(2026, 9, 5) / 1000}`;

const V1 = '/api/v1';
const V2 = '/api/v2';

/** The only path segments that changed name between versions (rename-map.json, `routes`). */
const RENAMED_SEGMENTS: Readonly<Record<string, string>> = {
  historia: 'history',
  soportes: 'receipts',
  usos: 'usage',
  unificar: 'merge',
};

function isV1(path: string): boolean {
  return path === V1 || path.startsWith(`${V1}/`);
}

/** The v2 path of a v1 path: `/api/v1/transactions/7/soportes` → `/api/v2/transactions/7/receipts`. */
export function successorOf(path: string): string {
  return (
    V2 +
    path
      .slice(V1.length)
      .split('/')
      .map((segment) => RENAMED_SEGMENTS[segment] ?? segment)
      .join('/')
  );
}

/** The route, not the request: numeric ids become `:id`, so nothing in it identifies anyone. */
export function routeTemplate(path: string): string {
  return path
    .split('/')
    .map((segment) => (/^\d+$/.test(segment) ? ':id' : segment))
    .join('/');
}

/**
 * Express middleware for the two halves above. `log` is the same structured
 * sink the access log writes to, so the line carries the request id.
 */
export function v1Deprecation(log: (entry: Record<string, unknown>) => void) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const path = req.originalUrl.split('?')[0] ?? '';
    if (isV1(path)) {
      res.setHeader('Deprecation', V1_DEPRECATION);
      res.setHeader('Link', `<${successorOf(path)}>; rel="successor-version"`);
      log({
        context: 'deprecation',
        msg: 'v1_used',
        method: req.method,
        route: routeTemplate(path),
      });
    }
    next();
  };
}
