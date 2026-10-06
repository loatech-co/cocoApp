import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { SupabaseAuthService } from './supabase-auth.service';
import { UsersRepository } from './users.repository';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { AuthenticationError, ForbiddenError } from '../../common/errors/domain-error';

/**
 * The authentication barrier for the whole API.
 *
 * It is registered as a GLOBAL guard on purpose: if protection were opt-in,
 * sooner or later a new controller would be published by accident. Here it is
 * the other way round — opening a route requires marking it with @Public().
 *
 * ── What changed with Supabase Auth ──────────────────────────────────────────
 * Supabase verifies the token's signature (ES256, against its JWKS). What was
 * NOT delegated is authorization: role and status still come from OUR
 * database on every request. A Supabase JWT says who someone is; it does not
 * know whether their account was approved, suspended or demoted ten seconds
 * ago.
 *
 * That per-request read is a cheap indexed query, and it is what allows three
 * things a JWT alone cannot give: immediate session revocation, immediate
 * lock-out when an account is suspended, and role changes without waiting for
 * the token to expire.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly supabase: SupabaseAuthService,
    private readonly users: UsersRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const token = extractBearer(request.headers.authorization);

    if (!token) {
      throw new AuthenticationError('Autenticación requerida.');
    }

    const { authId, iatMs } = await this.supabase.verifyAccessToken(token);

    const user = await this.users.findSessionUser(authId);

    if (!user) {
      // A valid Supabase token, but no profile in the app. It happens when the
      // account was created from the Supabase dashboard, skipping sign-up.
      // Without a profile there is no role or status, so nothing to authorize.
      throw new AuthenticationError('Token inválido o expirado.', { code: 'invalid_token' });
    }

    // IMMEDIATE REVOCATION: any token issued before this mark is dead.
    // Changing the password, suspending the account or "sign out on every
    // device" only move `sessionsValidFrom` forward, and the effect is instant
    // without going to the network or waiting for anything to expire.
    //
    // The comparison does NOT round `sessionsValidFrom` to the second. Doing
    // so looked reasonable —a JWT's `iat` only has second precision— but it
    // opens a gap: a token issued in the same second the session is revoked
    // would survive. That is exactly the window someone with a stolen token
    // needs.
    //
    // The price is an edge of under a second: if someone signs in again in the
    // same second they closed all their sessions, their new token may land on
    // the wrong side and have to retry. Rejecting too much for 600 ms is better
    // than accepting too little.
    if (iatMs < user.sessionsValidFrom.getTime()) {
      throw new AuthenticationError('La sesión fue cerrada. Vuelve a entrar.', {
        code: 'session_revoked',
      });
    }

    if (user.status !== 'active') {
      throw user.status === 'pending'
        ? new ForbiddenError('Tu cuenta está pendiente de aprobación.', {
            code: 'account_pending_approval',
          })
        : new ForbiddenError('Tu cuenta está suspendida.', { code: 'account_suspended' });
    }

    // The role comes from the DATABASE, not the token: if an admin demotes
    // someone, the change applies on the next request and not when their token
    // expires.
    request.user = { id: user.id, email: user.email, role: user.role };
    return true;
  }
}

function extractBearer(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, value] = header.split(' ');
  return scheme === 'Bearer' && value ? value : null;
}
