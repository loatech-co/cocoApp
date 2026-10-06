import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { FlagName } from '@coco/flags';

import { PasswordService } from './password.service';
import { SupabaseAuthService } from './supabase-auth.service';
import { UsersRepository } from './users.repository';
import { AuditService } from '../../common/audit/audit.service';
import { AuthenticationError, ForbiddenError } from '../../common/errors/domain-error';
import type { User } from '../../generated/prisma/client';
import { CategoriesService } from '../categories/categories.service';

export interface RequestContext {
  ip?: string | undefined;
  userAgent?: string | undefined;
}

/** A user's public profile, as the service hands it out (the domain). */
export interface Profile {
  id: bigint;
  email: string;
  displayName: string | null;
  role: User['role'];
  status: User['status'];
  createdAt: Date;
}

/** What `/auth/me` answers: the profile plus the flags on for this user (step 7.8). */
export type Me = Profile & { features: FlagName[] };

/** Lo que el controlador necesita para responder y poner la cookie. */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * Autenticación de la app.
 *
 * ── Reparto de responsabilidades tras migrar a Supabase Auth ────────────────
 * Supabase guarda las credenciales, las verifica, y emite y rota los tokens.
 * Aquí se queda todo lo que es del PRODUCTO y que Supabase no modela:
 *
 *   · La aprobación por un admin. Toda cuenta nace `pending` y no entra hasta
 *     que alguien la activa. Supabase daría por buena cualquier cuenta con el
 *     correo confirmado.
 *   · La bitácora. Cada entrada, salida y fallo queda registrado con IP y
 *     agente, que en una app de finanzas es parte del producto.
 *   · La revocación inmediata, vía `sessions_valid_from`.
 *   · La política de contraseñas, que es más exigente que la de Supabase.
 *
 * Lo que SÍ se perdió y conviene saber: la resistencia a ataques de tiempo del
 * login. Antes se gastaba un argon2 equivalente cuando el correo no existía,
 * para que la duración de la respuesta no delatara qué correos tienen cuenta.
 * Ahora la verificación ocurre dentro de Supabase y ese control ya no es
 * nuestro. En el registro sí se conserva el equivalente: se llama siempre a
 * Supabase, exista o no el correo, y la respuesta es idéntica en ambos casos.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly initialAdminEmail: string | null;

  constructor(
    private readonly users: UsersRepository,
    private readonly categories: CategoriesService,
    private readonly supabase: SupabaseAuthService,
    private readonly passwords: PasswordService,
    private readonly audit: AuditService,
    config: ConfigService,
  ) {
    this.initialAdminEmail =
      config.get<string>('BOOTSTRAP_ADMIN_EMAIL')?.trim().toLowerCase() || null;
  }

  // ── Registro ───────────────────────────────────────────────────────────────

  /**
   * Crea la cuenta en Supabase y su perfil aquí, en estado `pending`.
   *
   * Devuelve SIEMPRE el mismo resultado, exista o no el correo. Responder "ese
   * correo ya está registrado" convertiría este endpoint en un oráculo para
   * averiguar quién tiene cuenta. Como toda cuenta queda a la espera de
   * aprobación, el usuario legítimo no pierde nada: en ambos casos espera.
   *
   * La excepción es `BOOTSTRAP_ADMIN_EMAIL`, que nace admin y activo. Se hace
   * así, y no "el primer registro gana", porque si la app estuviera desplegada
   * antes de que el dueño se registre, cualquiera se llevaría el panel.
   */
  async register(
    input: { email: string; password: string; displayName: string },
    context: RequestContext,
  ): Promise<{ pendingApproval: boolean }> {
    const email = normalizeEmail(input.email);
    const displayName = input.displayName.trim();

    // La política se valida SIEMPRE, antes de mirar si el correo existe: si
    // solo se validara para correos nuevos, el tiempo de respuesta los delataría.
    await this.passwords.requireStrong(input.password, { email, displayName });

    // Se llama a Supabase exista o no el correo, para que la duración de la
    // respuesta sea la misma en ambos casos. Devuelve null si ya existía.
    const authId = await this.supabase.createUser(email, input.password);

    if (!authId) {
      this.logger.warn('Intento de registro sobre un correo ya existente.');
      return { pendingApproval: true };
    }

    const isInitialAdmin = this.initialAdminEmail === email;

    const user = await this.users.create({
      authId,
      email,
      displayName,
      role: isInitialAdmin ? 'admin' : 'user',
      status: isInitialAdmin ? 'active' : 'pending',
      approvedAt: isInitialAdmin ? new Date() : null,
      // Explícito, no por DEFAULT del motor. El guard compara este valor
      // contra el `iat` del token que emite Supabase; si uno lo pusiera el
      // reloj de Postgres y el otro el de Supabase, un desfase de
      // milisegundos entre relojes invalidaría sesiones legítimas.
      sessionsValidFrom: toSecond(new Date()),
    });

    /*
      ── La cuenta nace con su estructura ──────────────────────────────────
      Los centros de costos son de cada cuenta y no se comparten, así que una
      cuenta recién creada no tiene NINGUNO: al entrar, Centros de costos
      estaba vacío y la ficha de un movimiento no tenía dónde clasificar nada.
      Se copia la plantilla —los dos primeros niveles, congelados— y desde ese
      momento el árbol es suyo.

      Se hace aquí y no al aprobar porque la fila ya existe aquí, y porque una
      cuenta rechazada se lleva sus categorías por delante con el borrado en
      cascada: no queda nada suelto.

      ── Y si falla, la cuenta se crea igual ───────────────────────────────
      Sembrar es una comodidad; registrarse es la operación. Reventar aquí
      dejaría a la persona con su usuario ya creado en Supabase —así que
      reintentar no serviría de nada, el correo «ya existe»— y sin perfil, que
      es el único estado del que no se sale solo. El árbol se puede rellenar
      después desde `POST /categories/seed`.
    */
    try {
      await this.categories.seedNewAccount(user.id);
    } catch (error) {
      this.logger.error(
        `No se pudo sembrar la plantilla de la cuenta ${user.id}: ${(error as Error).message}`,
      );
    }

    await this.audit.record({
      userId: user.id,
      entity: 'users',
      entityId: user.id,
      action: 'auth.register',
      changes: { role: user.role, status: user.status },
      ip: context.ip,
      userAgent: context.userAgent,
    });

    return { pendingApproval: user.status === 'pending' };
  }

  // ── Login ──────────────────────────────────────────────────────────────────

  /**
   * Verifica credenciales contra Supabase y abre sesión.
   *
   * Orden deliberado: primero la contraseña, DESPUÉS el estado de la cuenta.
   * Así los mensajes específicos ("pendiente de aprobación", "suspendida")
   * solo los ve quien ya demostró conocer la contraseña. Al revés, cualquiera
   * podría averiguar qué correos tienen cuenta.
   */
  async signIn(
    input: { email: string; password: string },
    context: RequestContext,
  ): Promise<{ tokens: TokenPair; profile: Profile }> {
    const email = normalizeEmail(input.email);
    const session = await this.supabase.signIn(email, input.password);

    if (!session) {
      await this.audit.record({
        entity: 'users',
        action: 'auth.login_failed',
        changes: { motivo: 'credenciales_incorrectas' },
        ip: context.ip,
        userAgent: context.userAgent,
      });
      throw new AuthenticationError('Correo o contraseña incorrectos.', {
        code: 'invalid_credentials',
      });
    }

    const user = await this.users.findByAuthId(session.authId);

    if (!user) {
      // La cuenta existe en Supabase pero no tiene perfil aquí. Pasa si se creó
      // desde el panel de Supabase saltándose el registro de la app. Sin perfil
      // no hay rol ni estado, así que no se puede autorizar nada.
      this.logger.error(`Cuenta de Supabase ${session.authId} sin perfil en la aplicación.`);
      throw new ForbiddenError('Tu cuenta no está habilitada. Contacta al administrador.', {
        code: 'account_not_enabled',
      });
    }

    this.requireUsableAccount(user);

    // Si la marca de revocación quedó por delante del token que Supabase acaba
    // de emitir, se baja hasta él. Pasa al volver a entrar en el mismo segundo
    // en que se cerraron todas las sesiones: sin esto, el login parecería
    // correcto y la siguiente petición daría 401.
    //
    // Bajarla solo puede revivir tokens emitidos en ESE segundo, y solo cuando
    // alguien acaba de demostrar que conoce la contraseña. Lo anterior a ese
    // segundo sigue muerto.
    const signedInAt = new Date(Math.floor(Date.now() / 1000) * 1000);
    const stamp = user.sessionsValidFrom > signedInAt ? signedInAt : user.sessionsValidFrom;

    const updated = await this.users.update(user.id, {
      lastLoginAt: new Date(),
      sessionsValidFrom: stamp,
    });

    await this.audit.record({
      userId: updated.id,
      entity: 'users',
      entityId: updated.id,
      action: 'auth.login',
      ip: context.ip,
      userAgent: context.userAgent,
    });

    return { tokens: toTokenPair(session), profile: profileOf(updated) };
  }

  // ── Sesión ─────────────────────────────────────────────────────────────────

  async refresh(
    refreshToken: string,
    _context: RequestContext,
  ): Promise<{ tokens: TokenPair; profile: Profile }> {
    const session = await this.supabase.refresh(refreshToken);
    if (!session)
      throw new AuthenticationError('La sesión expiró. Vuelve a entrar.', {
        code: 'session_expired',
      });

    const user = await this.users.findByAuthId(session.authId);
    if (!user)
      throw new AuthenticationError('La sesión ya no es válida.', { code: 'session_revoked' });

    // El estado se revisa también al refrescar: si suspenden una cuenta, no
    // debe poder estirar su sesión indefinidamente cambiando un token por otro.
    //
    // Aquí es 401 y no 403, a diferencia del login. En el login la persona
    // acaba de demostrar que sabe la contraseña y merece saber POR QUÉ no
    // entra. En el refresco no hay nadie mirando: es el cliente renovando en
    // segundo plano, y un 401 le dice "esta sesión murió, mandá a entrar de
    // nuevo". Un 403 lo dejaría reintentando contra una sesión que no va a
    // revivir.
    if (user.status !== 'active') {
      throw new AuthenticationError('La sesión ya no es válida.', { code: 'session_revoked' });
    }

    return { tokens: toTokenPair(session), profile: profileOf(user) };
  }

  async signOut(refreshToken: string | undefined, context: RequestContext): Promise<void> {
    if (!refreshToken) return;

    const session = await this.supabase.refresh(refreshToken);
    await this.supabase.signOut(refreshToken);

    if (!session) return;
    const user = await this.users.findByAuthId(session.authId);
    if (!user) return;

    await this.audit.record({
      userId: user.id,
      entity: 'users',
      entityId: user.id,
      action: 'auth.logout',
      ip: context.ip,
      userAgent: context.userAgent,
    });
  }

  /** Cierra sesión en todos los dispositivos, de inmediato. */
  async signOutEverywhere(userId: bigint, context: RequestContext): Promise<void> {
    await this.revokeAllSessions(userId);
    await this.audit.record({
      userId,
      entity: 'users',
      entityId: userId,
      action: 'auth.logout_all',
      ip: context.ip,
      userAgent: context.userAgent,
    });
  }

  // ── Contraseña ─────────────────────────────────────────────────────────────

  /**
   * Cambio de contraseña por el propio usuario.
   *
   * Exige la actual: si bastara el access token, quien robara uno podría
   * apoderarse de la cuenta cambiándola. Al terminar cierra todas las sesiones
   * — incluida la del atacante, si la hubiera.
   */
  async changePassword(
    userId: bigint,
    input: { currentPassword: string; newPassword: string },
    context: RequestContext,
  ): Promise<void> {
    const user = await this.users.findByIdOrThrow(userId);
    if (!user.authId) {
      throw new ForbiddenError('Esta cuenta no tiene credenciales gestionadas.', {
        code: 'credentials_not_managed',
      });
    }

    if (!(await this.supabase.isPasswordCorrect(user.email, input.currentPassword))) {
      throw new AuthenticationError('La contraseña actual no es correcta.', {
        code: 'wrong_current_password',
      });
    }

    await this.passwords.requireStrong(input.newPassword, {
      email: user.email,
      displayName: user.displayName ?? undefined,
    });

    await this.supabase.changePassword(user.authId, input.newPassword);
    await this.revokeAllSessions(userId);

    await this.audit.record({
      userId,
      entity: 'users',
      entityId: userId,
      action: 'auth.password_changed',
      ip: context.ip,
      userAgent: context.userAgent,
    });
  }

  async getProfile(userId: bigint): Promise<Profile> {
    return profileOf(await this.users.findByIdOrThrow(userId));
  }

  // ── Interno ────────────────────────────────────────────────────────────────

  /**
   * Corta las sesiones por los DOS lados.
   *
   * `sessionsValidFrom` surte efecto en la siguiente petición sin salir a la
   * red, y es lo que hace que suspender una cuenta sea instantáneo. Revocar
   * además en Supabase es lo que impide que un refresh token robado siga
   * canjeándose por tokens nuevos. Hacer solo una de las dos deja un agujero:
   * la primera sin la segunda permite refrescar para siempre; la segunda sin la
   * primera deja vivo el access token actual hasta que expire.
   */
  async revokeAllSessions(userId: bigint): Promise<void> {
    const user = await this.users.update(userId, {
      sessionsValidFrom: toNextSecond(new Date()),
    });

    if (user.authId) {
      await this.supabase.signOutEverywhere(user.authId);
    }
  }

  private requireUsableAccount(user: User): void {
    if (user.status === 'pending') {
      throw new ForbiddenError(
        'Tu cuenta está pendiente de aprobación. Te avisaremos cuando esté lista.',
        { code: 'account_pending_approval' },
      );
    }
    if (user.status === 'suspended') {
      throw new ForbiddenError('Tu cuenta está suspendida. Contacta al administrador.', {
        code: 'account_suspended',
      });
    }
  }
}

/** Minúsculas y sin espacios: `Gerardo@X.com ` y `gerardo@x.com` son la misma cuenta. */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function profileOf(user: User): Profile {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt,
  };
}

/**
 * Recorta un instante al segundo. Toda comparación con `sessionsValidFrom` se
 * hace en esta unidad porque el `iat` de un JWT no tiene más precisión: si aquí
 * se guardaran milisegundos, un token emitido en el mismo segundo parecería
 * ANTERIOR a su propia sesión y el guard lo rechazaría nada más nacer.
 */
function toSecond(instant: Date): Date {
  return new Date(Math.floor(instant.getTime() / 1000) * 1000);
}

/**
 * El primer instante que una sesión nueva puede tener para considerarse
 * posterior a una revocación: el segundo SIGUIENTE.
 *
 * Apuntar al segundo en curso dejaría vivos los tokens emitidos en ese mismo
 * segundo —justo la ventana que necesita alguien con un token robado—, así que
 * se redondea hacia arriba. El precio es un borde de menos de un segundo al
 * volver a entrar, que `entrar` resuelve.
 */
function toNextSecond(instant: Date): Date {
  return new Date(Math.floor(instant.getTime() / 1000) * 1000 + 1000);
}

function toTokenPair(session: {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}): TokenPair {
  return {
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    expiresIn: session.expiresIn,
  };
}
