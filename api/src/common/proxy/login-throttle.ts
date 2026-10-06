import type { ExecutionContext } from '@nestjs/common';
import type { ThrottlerOptions } from '@nestjs/throttler';
import type { Request } from 'express';
import { createHash } from 'node:crypto';

/**
 * A second limit on login, per ACCOUNT instead of per address.
 *
 * The per-IP limit (`@Throttle` on the route) stops one machine. It does not
 * stop guessing one person's password from many machines, each well under
 * its own limit. This one counts attempts against the same email, whoever
 * sends them. The key leaves the route out, so no other route (or a future
 * version of this one) can be used to double the allowance.
 *
 * Ten per fifteen minutes: a person who mistypes their password does not get
 * near it, and a guesser gets forty tries an hour instead of unlimited. The
 * cost —someone can keep a known email locked out for fifteen minutes— is the
 * usual trade, and the right password still works once the window passes.
 *
 * The key is a hash of the normalised email, so the limiter's memory never
 * holds an address in clear.
 */
export const LOGIN_PER_EMAIL: ThrottlerOptions = {
  name: 'login-email',
  ttl: 15 * 60_000,
  limit: 10,
  skipIf: (context: ExecutionContext) => !isLogin(context.switchToHttp().getRequest<Request>()),
  getTracker: (req: Record<string, unknown>) => emailFingerprint(req),
  generateKey: (_context: ExecutionContext, tracker: string, name: string) => `${name}:${tracker}`,
};

function isLogin(req: Request): boolean {
  return req.method === 'POST' && /^\/api\/v\d+\/auth\/login\/?$/.test(req.path);
}

function emailFingerprint(req: Record<string, unknown>): string {
  const body = req.body as { email?: unknown } | undefined;
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  return createHash('sha256').update(email).digest('hex');
}
