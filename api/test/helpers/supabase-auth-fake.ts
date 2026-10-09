import { UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import type { SupabaseSession } from '../../src/modules/auth/supabase-auth.service';

/**
 * Doble en memoria de Supabase Auth para las pruebas e2e.
 *
 * ── Por qué no se habla con Supabase de verdad ──────────────────────────────
 * Porque las pruebas crearían cuentas REALES en el proyecto de producción —es
 * el único que hay en el plan gratuito—, en cada corrida y por decenas. A eso
 * se suma que dependerían de la red, de los límites de peticiones de GoTrue y
 * de que alguien limpie después.
 *
 * ── Qué se sigue probando, y qué no ─────────────────────────────────────────
 * Se prueba lo NUESTRO, que es lo que puede romperse al cambiar el código: la
 * aprobación por un admin, los estados de cuenta, el guard, la revocación por
 * `sessions_valid_from`, los permisos por rol y la bitácora.
 *
 * NO se prueba que Supabase verifique bien una contraseña ni que su firma sea
 * válida. Eso es suyo, y probarlo aquí sería probar la biblioteca de otro.
 *
 * El token es deliberadamente transparente —`falso.<authId>.<iat>`— para que
 * una prueba pueda fabricar el caso que necesite, como un token emitido antes
 * de una revocación, sin montar un firmador.
 */
export class SupabaseAuthFake {
  private readonly accounts = new Map<string, { email: string; password: string }>();
  private readonly refreshTokens = new Map<string, string>();

  // ── Lo que consume el guard ────────────────────────────────────────────────

  verifyAccessToken(token: string): Promise<{ authId: string; email: string; iatMs: number }> {
    const parts = token.split('.');
    if (parts.length !== 3 || parts[0] !== 'falso') {
      return Promise.reject(new UnauthorizedException('Token inválido o expirado.'));
    }

    const [, authId = '', iat] = parts; // ya se comprobó que son tres partes
    const account = this.accounts.get(authId);
    if (!account) return Promise.reject(new UnauthorizedException('Token inválido o expirado.'));

    // Segundos, como el `iat` real de un JWT. La pérdida de precisión es parte
    // de lo que se quiere reproducir: el guard tiene que tolerarla.
    return Promise.resolve({ authId, email: account.email, iatMs: Number(iat) * 1000 });
  }

  // ── Sesiones ───────────────────────────────────────────────────────────────

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
    // ROTACIÓN, como hace Supabase de verdad: el token que se acaba de usar
    // muere y nace otro. Sin esto, una prueba podría dar por buena una
    // renovación que en producción fallaría al segundo uso del mismo token.
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

  // ── Cuentas ────────────────────────────────────────────────────────────────

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

  // ── Utilidades para las pruebas ────────────────────────────────────────────

  /** Registra una cuenta ya existente y devuelve su id, sin pasar por el registro. */
  seed(email: string, password: string): string {
    const authId = randomUUID();
    this.accounts.set(authId, { email, password });
    return authId;
  }

  /** Emite un token para esa cuenta, opcionalmente fechado en el pasado. */
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
