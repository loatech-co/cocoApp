import { UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import type { SesionDeSupabase } from '../../src/modules/auth/supabase-auth.service';

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
export class SupabaseAuthFalso {
  private readonly cuentas = new Map<string, { email: string; password: string }>();
  private readonly refrescos = new Map<string, string>();

  // ── Lo que consume el guard ────────────────────────────────────────────────

  verificarAccessToken(token: string): Promise<{ authId: string; email: string; iatMs: number }> {
    const partes = token.split('.');
    if (partes.length !== 3 || partes[0] !== 'falso') {
      return Promise.reject(new UnauthorizedException('Token inválido o expirado.'));
    }

    const [, authId = '', iat] = partes; // ya se comprobó que son tres partes
    const cuenta = this.cuentas.get(authId);
    if (!cuenta) return Promise.reject(new UnauthorizedException('Token inválido o expirado.'));

    // Segundos, como el `iat` real de un JWT. La pérdida de precisión es parte
    // de lo que se quiere reproducir: el guard tiene que tolerarla.
    return Promise.resolve({ authId, email: cuenta.email, iatMs: Number(iat) * 1000 });
  }

  // ── Sesiones ───────────────────────────────────────────────────────────────

  entrar(email: string, password: string): Promise<SesionDeSupabase | null> {
    const entrada = [...this.cuentas.entries()].find(([, c]) => c.email === email);
    if (entrada?.[1].password !== password) return Promise.resolve(null);
    return Promise.resolve(this.abrirSesion(entrada[0], email));
  }

  refrescar(refreshToken: string): Promise<SesionDeSupabase | null> {
    const authId = this.refrescos.get(refreshToken);
    if (!authId) return Promise.resolve(null);
    const cuenta = this.cuentas.get(authId);
    if (!cuenta) return Promise.resolve(null);
    // ROTACIÓN, como hace Supabase de verdad: el token que se acaba de usar
    // muere y nace otro. Sin esto, una prueba podría dar por buena una
    // renovación que en producción fallaría al segundo uso del mismo token.
    this.refrescos.delete(refreshToken);
    return Promise.resolve(this.abrirSesion(authId, cuenta.email));
  }

  cerrarSesion(refreshToken: string): Promise<void> {
    this.refrescos.delete(refreshToken);
    return Promise.resolve();
  }

  cerrarTodasLasSesiones(authId: string): Promise<void> {
    for (const [token, id] of this.refrescos) {
      if (id === authId) this.refrescos.delete(token);
    }
    return Promise.resolve();
  }

  // ── Cuentas ────────────────────────────────────────────────────────────────

  crearUsuario(email: string, password: string): Promise<string | null> {
    if ([...this.cuentas.values()].some((c) => c.email === email)) return Promise.resolve(null);
    const authId = randomUUID();
    this.cuentas.set(authId, { email, password });
    return Promise.resolve(authId);
  }

  cambiarContrasena(authId: string, nueva: string): Promise<void> {
    const cuenta = this.cuentas.get(authId);
    if (cuenta) this.cuentas.set(authId, { ...cuenta, password: nueva });
    return Promise.resolve();
  }

  contrasenaEsCorrecta(email: string, password: string): Promise<boolean> {
    return Promise.resolve(
      [...this.cuentas.values()].some((c) => c.email === email && c.password === password),
    );
  }

  eliminarUsuario(authId: string): Promise<void> {
    this.cuentas.delete(authId);
    return Promise.resolve();
  }

  // ── Utilidades para las pruebas ────────────────────────────────────────────

  /** Registra una cuenta ya existente y devuelve su id, sin pasar por el registro. */
  sembrar(email: string, password: string): string {
    const authId = randomUUID();
    this.cuentas.set(authId, { email, password });
    return authId;
  }

  /** Emite un token para esa cuenta, opcionalmente fechado en el pasado. */
  emitirToken(authId: string, emitidoEn: Date = new Date()): string {
    return `falso.${authId}.${Math.floor(emitidoEn.getTime() / 1000)}`;
  }

  abrirSesion(authId: string, email: string): SesionDeSupabase {
    const refreshToken = `refresco-${randomUUID()}`;
    this.refrescos.set(refreshToken, authId);
    return {
      accessToken: this.emitirToken(authId),
      refreshToken,
      expiresIn: 900,
      authId,
      email,
    };
  }

  limpiar(): void {
    this.cuentas.clear();
    this.refrescos.clear();
  }
}
