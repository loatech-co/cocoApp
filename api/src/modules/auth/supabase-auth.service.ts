import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify } from 'jose';

import { isDuplicateEmail } from './supabase-auth.errors';
import { whyNotTouchRealAccounts } from '../../common/env';
import {
  AuthenticationError,
  ForbiddenError,
  InternalError,
} from '../../common/errors/domain-error';

/**
 * Supabase Auth (GoTrue) client.
 *
 * ── Why the API talks to GoTrue and not the browser ──────────────────────────
 * The idiomatic Supabase setup has the frontend use supabase-js and keep the
 * session in localStorage. Not here, for a concrete reason: this app's refresh
 * token lives in an httpOnly cookie with SameSite=Strict, and a token in
 * localStorage is readable by any script that manages to get injected. For
 * financial data that difference matters more than convenience.
 *
 * The browser still talks only to our API, which translates to GoTrue. In
 * exchange, Supabase becomes the credential store and the token issuer; we
 * keep admin approval, the audit log and immediate session revocation.
 *
 * ── Why it verifies with JWKS and not with the project secret ────────────────
 * The project signs with ES256 and publishes its public key. Verifying against
 * the JWKS means the API stores no signing secret, and a key rotation in
 * Supabase needs no redeploy: jose caches the set and revalidates it on its
 * own.
 */
@Injectable()
export class SupabaseAuthService {
  private readonly logger = new Logger(SupabaseAuthService.name);
  private readonly url: string;
  private readonly anonKey: string;
  private readonly serviceKey: string;
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;
  private readonly issuer: string;

  constructor(config: ConfigService) {
    this.url = requireSetting(config, 'SUPABASE_URL').replace(/\/+$/, '');
    this.anonKey = requireSetting(config, 'SUPABASE_ANON_KEY');
    this.serviceKey = requireSetting(config, 'SUPABASE_SERVICE_ROLE_KEY');
    this.issuer = `${this.url}/auth/v1`;
    this.jwks = createRemoteJWKSet(new URL(`${this.issuer}/.well-known/jwks.json`));
  }

  // ── Verification ───────────────────────────────────────────────────────────

  /**
   * Checks the signature and returns the least the guard needs.
   *
   * `iat` comes back in MILLISECONDS even though the JWT carries seconds: the
   * guard compares it against `sessionsValidFrom`, which is a Date. Mixing the
   * two units would accept any token issued in the last 54 years, which is
   * exactly the bug nobody catches in tests.
   */
  async verifyAccessToken(
    token: string,
  ): Promise<{ authId: string; email: string; iatMs: number }> {
    try {
      const { payload } = await jwtVerify(token, this.jwks, {
        issuer: this.issuer,
        audience: 'authenticated',
      });

      if (!payload.sub || typeof payload.iat !== 'number') {
        throw new Error('el token no trae sub o iat');
      }

      return {
        authId: payload.sub,
        email: typeof payload.email === 'string' ? payload.email : '',
        iatMs: payload.iat * 1000,
      };
    } catch {
      // No details on purpose: telling "bad signature" from "expired" or
      // "wrong issuer" only helps whoever is probing tokens.
      throw new AuthenticationError('Token inválido o expirado.', { code: 'invalid_token' });
    }
  }

  // ── Sessions ───────────────────────────────────────────────────────────────

  /** Trades email and password for a session. `null` if they are not valid. */
  async signIn(email: string, password: string): Promise<SupabaseSession | null> {
    const response = await this.call('POST', '/token?grant_type=password', {
      body: { email, password },
      key: this.anonKey,
    });

    if (response.status === 400 || response.status === 401) return null;
    return this.toSession(response);
  }

  /** Trades a refresh token for a new session. `null` if it no longer works. */
  async refresh(refreshToken: string): Promise<SupabaseSession | null> {
    const response = await this.call('POST', '/token?grant_type=refresh_token', {
      body: { refresh_token: refreshToken },
      key: this.anonKey,
    });

    if (response.status === 400 || response.status === 401) return null;
    return this.toSession(response);
  }

  /**
   * Revokes in Supabase the session this refresh token belongs to.
   *
   * It has to be traded first because `/logout` authenticates with the ACCESS
   * token, not the refresh one. If the trade fails, the session was already
   * dead and there is nothing to revoke.
   */
  async signOut(refreshToken: string): Promise<void> {
    const session = await this.refresh(refreshToken);
    if (!session) return;

    await this.call('POST', '/logout?scope=local', {
      key: this.anonKey,
      authorization: session.accessToken,
    });
  }

  /** Revokes ALL of the person's sessions in Supabase. */
  async signOutEverywhere(authId: string): Promise<void> {
    // The admin endpoint takes the id and cuts every refresh-token family of
    // that account at once.
    await this.call('POST', `/admin/users/${authId}/logout`, { key: this.serviceKey });
  }

  // ── Account administration ─────────────────────────────────────────────────

  /**
   * Creates the account in Supabase and returns its `id`, or `null` if that
   * email was ALREADY registered.
   *
   * It uses the ADMIN endpoint, not `/signup`, for two reasons: it can mark
   * the email as confirmed without depending on the free plan's SMTP —capped
   * at a few sends per hour—, and it keeps `/signup` from returning a session
   * right away, when here every new account is born pending approval and
   * must not be able to sign in yet.
   *
   * ── The `null` means one thing and only one ──────────────────────────────
   * The caller turns that `null` into «your request is pending» without
   * creating anything, because for an email that already exists that is
   * exactly right: it neither confirms nor denies that the account exists,
   * and the legitimate user waits just as they would.
   *
   * What it can NOT mean is «something odd happened». Any 422 used to come
   * back as `null`, and GoTrue answers 422 to several different things: the
   * email already registered, yes, but also a password that fails ITS policy
   * —which is not ours—, a malformed email and sign-ups disabled in the
   * project. In all of those the request was lost silently: the sender read
   * «Recibimos tu solicitud», no row was created, nothing went to the audit
   * log, and the admin had nothing to approve and no way to find out. If
   * Supabase's policy was stricter than ours, that happened to EVERYONE.
   *
   * Now only the repeated email comes back as `null`. Anything else fails with
   * a 500, which is what it is: the requester sees that something failed and
   * can retry or tell someone, and the server log says what Supabase answered.
   */
  async createUser(email: string, password: string): Promise<string | null> {
    const response = await this.call('POST', '/admin/users', {
      body: { email, password, email_confirm: true },
      key: this.serviceKey,
    });

    if (isDuplicateEmail(response.status, response.data)) return null;
    if (response.status >= 400) this.fail(response, 'create the user');

    const id = response.data?.id;
    if (typeof id !== 'string') this.fail(response, 'create the user');
    return id;
  }

  async changePassword(authId: string, newPassword: string): Promise<void> {
    const response = await this.call('PUT', `/admin/users/${authId}`, {
      body: { password: newPassword },
      key: this.serviceKey,
    });
    if (response.status >= 400) this.fail(response, 'change the password');
  }

  async deleteUser(authId: string): Promise<void> {
    await this.call('DELETE', `/admin/users/${authId}`, { key: this.serviceKey });
  }

  /** Checks a password without opening a session, to re-authenticate. */
  async isPasswordCorrect(email: string, password: string): Promise<boolean> {
    const session = await this.signIn(email, password);
    if (!session) return false;
    // The session is thrown away: only the check mattered. Leaving it alive
    // would be a session nobody asked for and nobody will close.
    await this.call('POST', '/logout?scope=local', {
      key: this.anonKey,
      authorization: session.accessToken,
    });
    return true;
  }

  // ── Plumbing ───────────────────────────────────────────────────────────────

  private async call(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    options: { body?: unknown; key: string; authorization?: string },
  ): Promise<SupabaseReply> {
    /*
      The real-accounts lock goes HERE, not in the four methods.

      The four operations that reach a real account —create, delete, change
      the password, close every session— share a mark that is no accident:
      they all hit `/admin/` with the service key. Checking it at the one
      point they all go through means a fifth one written tomorrow is born
      protected, without anybody having to remember.

      Written four times, it would be the fourth copy that got forgotten: that
      is exactly what happened to the lock on static cost centers, which fell
      off when the sheet was redesigned because it lived repeated in two
      places.

      Signing in, refreshing and closing one's OWN session do not come through
      here: they use the anon key and routes that are not admin ones. That way
      the app can still be used locally, which is the point.
    */
    if (path.startsWith('/admin/')) {
      const blocker = whyNotTouchRealAccounts();
      if (blocker !== null) {
        this.logger.warn(`Admin operation blocked: ${method} ${path}`);
        throw new ForbiddenError(blocker, { code: 'real_accounts_protected' });
      }
    }

    const headers: Record<string, string> = {
      apikey: options.key,
      Authorization: `Bearer ${options.authorization ?? options.key}`,
    };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';

    let response: Response;
    try {
      response = await fetch(`${this.issuer}${path}`, {
        method,
        headers,
        ...(options.body !== undefined && { body: JSON.stringify(options.body) }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      // The database and the identity provider are separate services now: one
      // can be down while the other is fine. It is told apart from "wrong
      // credentials" because the answer to the user is not the same.
      this.logger.error(`Supabase Auth did not answer: ${(error as Error).message}`);
      throw new InternalError('El servicio de identidad no está disponible.', {
        code: 'identity_provider_failed',
      });
    }

    const text = await response.text();
    let data: Record<string, unknown> | null;
    try {
      data = text ? (JSON.parse(text) as Record<string, unknown>) : null;
    } catch {
      data = null;
    }

    return { status: response.status, data };
  }

  private toSession(response: SupabaseReply): SupabaseSession {
    const d = response.data;
    const accessToken = d?.access_token;
    const refreshToken = d?.refresh_token;
    const user = d?.user as { id?: string; email?: string } | undefined;

    if (typeof accessToken !== 'string' || typeof refreshToken !== 'string' || !user?.id) {
      this.fail(response, 'open the session');
    }

    return {
      accessToken,
      refreshToken,
      expiresIn: typeof d?.expires_in === 'number' ? d.expires_in : 3600,
      authId: user.id,
      email: user.email ?? '',
    };
  }

  private fail(response: SupabaseReply, action: SupabaseAction): never {
    const detail = response.data?.msg ?? response.data?.message ?? 'no detail';
    this.logger.error(
      `Supabase Auth failed (${action}): ${response.status} ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`,
    );
    throw new InternalError(`No se pudo ${USER_ACTION[action]}.`, {
      code: 'identity_provider_failed',
    });
  }
}

export interface SupabaseSession {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  authId: string;
  email: string;
}

/** What was being done when Supabase failed: English for the log, Spanish for the person. */
const USER_ACTION = {
  'create the user': 'crear el usuario',
  'change the password': 'cambiar la contraseña',
  'open the session': 'abrir la sesión',
} as const;
type SupabaseAction = keyof typeof USER_ACTION;

interface SupabaseReply {
  status: number;
  data: Record<string, unknown> | null;
}

/** A required setting, trimmed: authentication cannot work without it. */
function requireSetting(config: ConfigService, key: string): string {
  const value = config.get<string>(key)?.trim();
  if (!value) {
    throw new Error(`Falta ${key}. Sin ella la autenticación no puede funcionar.`);
  }
  return value;
}
