import { UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import type { SupabaseSession } from '../../src/modules/auth/supabase-auth.service';

/**
 * In-memory double of Supabase Auth for the e2e tests.
 *
 * ── Why the tests do not talk to the real Supabase ──────────────────────────
 * Because they would create REAL accounts in the production project —the only
 * one there is on the free plan—, on every run and by the dozen. On top of
 * that they would depend on the network, on GoTrue's request limits and on
 * someone cleaning up afterwards.
 *
 * ── What is still tested, and what is not ───────────────────────────────────
 * What is OURS is tested, which is what can break when the code changes:
 * approval by an admin, account statuses, the guard, revocation through
 * `sessions_valid_from`, role permissions and the audit log.
 *
 * It does NOT test that Supabase checks a password correctly or that its
 * signature is valid. That is theirs, and testing it here would be testing
 * someone else's library.
 *
 * The token is deliberately transparent —`falso.<authId>.<iat>`— so a test can
 * build the case it needs, such as a token issued before a revocation,
 * without setting up a signer.
 */
export class SupabaseAuthFake {
  private readonly accounts = new Map<string, { email: string; password: string }>();
  private readonly refreshTokens = new Map<string, string>();

  // ── What the guard uses ────────────────────────────────────────────────────

  verifyAccessToken(token: string): Promise<{ authId: string; email: string; iatMs: number }> {
    const parts = token.split('.');
    if (parts.length !== 3 || parts[0] !== 'falso') {
      return Promise.reject(new UnauthorizedException('Token inválido o expirado.'));
    }

    const [, authId = '', iat] = parts; // already checked that there are three parts
    const account = this.accounts.get(authId);
    if (!account) return Promise.reject(new UnauthorizedException('Token inválido o expirado.'));

    // Seconds, like the real `iat` of a JWT. The lost precision is part of
    // what is being reproduced: the guard has to tolerate it.
    return Promise.resolve({ authId, email: account.email, iatMs: Number(iat) * 1000 });
  }

  // ── Sessions ───────────────────────────────────────────────────────────────

  signIn(email: string, password: string): Promise<SupabaseSession | null> {
    const entry = [...this.accounts.entries()].find(([, c]) => c.email === email);
    if (entry?.[1].password !== password) return Promise.resolve(null);
    return Promise.resolve(this.openSession(entry[0], email));
  }

  refresh(refreshToken: string): Promise<SupabaseSession | null> {
    const authId = this.refreshTokens.get(refreshToken);
    if (!authId) return Promise.resolve(null);
    const account = this.accounts.get(authId);
    if (!account) return Promise.resolve(null);
    // ROTATION, as the real Supabase does: the token just used dies and a new
    // one is born. Without this, a test could accept a renewal that in
    // production would fail on the second use of the same token.
    this.refreshTokens.delete(refreshToken);
    return Promise.resolve(this.openSession(authId, account.email));
  }

  signOut(refreshToken: string): Promise<void> {
    this.refreshTokens.delete(refreshToken);
    return Promise.resolve();
  }

  signOutEverywhere(authId: string): Promise<void> {
    for (const [token, id] of this.refreshTokens) {
      if (id === authId) this.refreshTokens.delete(token);
    }
    return Promise.resolve();
  }

  // ── Accounts ───────────────────────────────────────────────────────────────

  createUser(email: string, password: string): Promise<string | null> {
    if ([...this.accounts.values()].some((c) => c.email === email)) return Promise.resolve(null);
    const authId = randomUUID();
    this.accounts.set(authId, { email, password });
    return Promise.resolve(authId);
  }

  changePassword(authId: string, newPassword: string): Promise<void> {
    const account = this.accounts.get(authId);
    if (account) this.accounts.set(authId, { ...account, password: newPassword });
    return Promise.resolve();
  }

  isPasswordCorrect(email: string, password: string): Promise<boolean> {
    return Promise.resolve(
      [...this.accounts.values()].some((c) => c.email === email && c.password === password),
    );
  }

  deleteUser(authId: string): Promise<void> {
    this.accounts.delete(authId);
    return Promise.resolve();
  }

  // ── Test utilities ─────────────────────────────────────────────────────────

  /** Whether a credential exists for this email: an orphan shows up here. */
  hasAccount(email: string): boolean {
    return [...this.accounts.values()].some((c) => c.email === email);
  }

  /** Registers an existing account and returns its id, without going through sign-up. */
  seed(email: string, password: string): string {
    const authId = randomUUID();
    this.accounts.set(authId, { email, password });
    return authId;
  }

  /** Issues a token for that account, optionally dated in the past. */
  issueToken(authId: string, issuedAt: Date = new Date()): string {
    return `falso.${authId}.${Math.floor(issuedAt.getTime() / 1000)}`;
  }

  openSession(authId: string, email: string): SupabaseSession {
    const refreshToken = `refresco-${randomUUID()}`;
    this.refreshTokens.set(refreshToken, authId);
    return {
      accessToken: this.issueToken(authId),
      refreshToken,
      expiresIn: 900,
      authId,
      email,
    };
  }

  clear(): void {
    this.accounts.clear();
    this.refreshTokens.clear();
  }
}
