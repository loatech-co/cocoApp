import type { NextFunction, Request, Response } from 'express';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

interface RequestContext {
  requestId: string;
}

/**
 * The request id of whatever is running right now, carried across every
 * `await` of that request without passing it around. The logger reads it, so
 * every line a request produces —the guard, a service, Prisma's errors, the
 * exceptions filter— carries the same id and the request can be followed end
 * to end with one `grep`.
 */
const storage = new AsyncLocalStorage<RequestContext>();

export function currentRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}

/** An incoming `X-Request-Id` is kept only if it looks like an id, never echoed blindly into the logs. */
const ACCEPTED_ID = /^[A-Za-z0-9._-]{8,64}$/;

/**
 * Express middleware: assigns the request id, returns it as `X-Request-Id`,
 * and writes one access line when the response finishes.
 *
 * The access line has method, path WITHOUT the query string, status, duration
 * and the internal user id — never amounts, descriptions or the query, which
 * is where search terms and personal data would travel.
 */
export function requestContext(log: (entry: Record<string, unknown>) => void) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const incoming = req.header('x-request-id');
    const requestId = incoming && ACCEPTED_ID.test(incoming) ? incoming : randomUUID();
    const started = process.hrtime.bigint();
    res.setHeader('X-Request-Id', requestId);

    res.on('finish', () => {
      storage.run({ requestId }, () => {
        const user = (req as Request & { user?: { id: bigint } }).user;
        log({
          context: 'http',
          msg: 'request',
          method: req.method,
          path: req.originalUrl.split('?')[0],
          status: res.statusCode,
          ms: Number((process.hrtime.bigint() - started) / 1_000_000n),
          userId: user ? String(user.id) : undefined,
        });
      });
    });

    storage.run({ requestId }, next);
  };
}
