import { Injectable } from '@nestjs/common';
import type { Prisma, UserRole } from '../../generated/prisma/client';

import type { ListUsersQueryDto } from './admin.dto';
import { AuditService } from '../../common/audit/audit.service';
import { BadRequestError, NotFoundError, ValidationError } from '../../common/errors/domain-error';
import { profileOf, AuthService, type Profile } from '../auth/auth.service';
import { PasswordService } from '../auth/password.service';
import { SupabaseAuthService } from '../auth/supabase-auth.service';
import { UsersService } from '../auth/users.service';

interface Contexto {
  ip?: string | null;
  userAgent?: string | null;
}

/** A page of a list the database pages: the domain, before any version names it. */
interface Paged<T> {
  data: T[];
  meta: { page: number; perPage: number; total: number };
}

export type UserPage = Paged<Profile>;

/** One entry of the audit log, as the service hands it out. */
export interface AuditEntry {
  id: bigint;
  action: string;
  entity: string;
  entityId: bigint | null;
  user: { email: string; name: string | null } | null;
  /** What changed, exactly as it was recorded: data, never renamed. */
  changes: Prisma.JsonValue;
  ip: string | null;
  createdAt: Date;
}

export type AuditPage = Paged<AuditEntry>;

@Injectable()
export class AdminService {
  constructor(
    private readonly users: UsersService,
    private readonly auth: AuthService,
    private readonly supabase: SupabaseAuthService,
    private readonly passwords: PasswordService,
    private readonly audit: AuditService,
  ) {}

  async listarUsuarios(filtros: ListUsersQueryDto): Promise<UserPage> {
    const page = filtros.page ?? 1;
    const perPage = filtros.per_page ?? 50;
    const { users: usuarios, total } = await this.users.page(
      filtros.status,
      (page - 1) * perPage,
      perPage,
    );

    return {
      data: usuarios.map(profileOf),
      meta: { page, perPage, total },
    };
  }

  async aprobar(adminId: bigint, userId: bigint, contexto: Contexto): Promise<Profile> {
    const usuario = await this.exigirUsuario(userId);

    if (usuario.status === 'active') {
      throw new BadRequestError('Esa cuenta ya está activa.', { code: 'user_already_active' });
    }

    const actualizado = await this.users.approve(adminId, userId);

    await this.audit.registrar({
      userId: adminId,
      entity: 'users',
      entityId: userId,
      action: 'admin.user_approved',
      changes: { de: usuario.status, a: 'active' },
      ...contexto,
    });

    return profileOf(actualizado);
  }

  /**
   * Suspender corta el acceso AL INSTANTE: además de cambiar el estado, revoca
   * todas las sesiones. Sin eso, quien ya tuviera un access token seguiría
   * entrando hasta que expirara.
   */
  async suspender(adminId: bigint, userId: bigint, contexto: Contexto): Promise<Profile> {
    this.exigirQueNoSeaUnoMismo(adminId, userId, 'suspenderte a ti mismo');
    const usuario = await this.exigirUsuario(userId);
    await this.exigirQueQuedeAlgunAdmin(usuario.role, userId);

    const actualizado = await this.users.setStatus(adminId, userId, 'suspended');
    await this.auth.revocarTodasLasSesiones(userId);

    await this.audit.registrar({
      userId: adminId,
      entity: 'users',
      entityId: userId,
      action: 'admin.user_suspended',
      changes: { de: usuario.status, a: 'suspended' },
      ...contexto,
    });

    return profileOf(actualizado);
  }

  async reactivar(adminId: bigint, userId: bigint, contexto: Contexto): Promise<Profile> {
    const usuario = await this.exigirUsuario(userId);

    const actualizado = await this.users.setStatus(adminId, userId, 'active');

    await this.audit.registrar({
      userId: adminId,
      entity: 'users',
      entityId: userId,
      action: 'admin.user_reactivated',
      changes: { de: usuario.status, a: 'active' },
      ...contexto,
    });

    return profileOf(actualizado);
  }

  async cambiarRol(
    adminId: bigint,
    userId: bigint,
    rol: UserRole,
    contexto: Contexto,
  ): Promise<Profile> {
    this.exigirQueNoSeaUnoMismo(adminId, userId, 'cambiar tu propio rol');
    const usuario = await this.exigirUsuario(userId);

    if (usuario.role === 'admin' && rol === 'user') {
      await this.exigirQueQuedeAlgunAdmin(usuario.role, userId);
    }

    const actualizado = await this.users.setRole(adminId, userId, rol);

    // El rol se lee de la base en cada petición, así que el cambio ya aplica.
    // Aun así se cierran las sesiones: un cambio de permisos merece que la
    // persona vuelva a entrar y vea su nuevo contexto desde cero.
    await this.auth.revocarTodasLasSesiones(userId);

    await this.audit.registrar({
      userId: adminId,
      entity: 'users',
      entityId: userId,
      action: 'admin.role_changed',
      changes: { de: usuario.role, a: rol },
      ...contexto,
    });

    return profileOf(actualizado);
  }

  /**
   * Restablece la contraseña de otra cuenta.
   *
   * Existe porque el envío de correos del plan gratuito no da para un
   * autoservicio de recuperación fiable: el administrador es el camino de
   * vuelta para quien olvide su clave.
   * Es una operación potente y por eso queda auditada, y cierra todas las
   * sesiones de esa persona.
   */
  async restablecerContrasena(
    adminId: bigint,
    userId: bigint,
    nueva: string,
    contexto: Contexto,
  ): Promise<void> {
    const usuario = await this.exigirUsuario(userId);

    await this.passwords.exigirQueSeaFuerte(nueva, {
      email: usuario.email,
      displayName: usuario.displayName ?? undefined,
    });

    // La contraseña la guarda Supabase; aquí no queda ni rastro de ella.
    if (!usuario.authId) {
      throw new ValidationError(
        'Esta cuenta no tiene credenciales gestionadas y no se le puede restablecer la contraseña.',
        { code: 'password_reset_not_managed' },
      );
    }
    await this.supabase.cambiarContrasena(usuario.authId, nueva);
    await this.auth.revocarTodasLasSesiones(userId);

    await this.audit.registrar({
      userId: adminId,
      entity: 'users',
      entityId: userId,
      action: 'admin.password_reset',
      ...contexto,
    });
  }

  /** The query arrives as URL text: de ahí el `Number`. */
  async bitacora(adminId: bigint, query: { page?: string; per_page?: string }): Promise<AuditPage> {
    const page = query.page ? Number(query.page) : 1;
    const perPage = query.per_page ? Number(query.per_page) : 50;

    const { entries: eventos, total } = await this.audit.page(
      adminId,
      (page - 1) * perPage,
      perPage,
    );

    return {
      data: eventos.map((evento) => ({
        id: evento.id,
        action: evento.action,
        entity: evento.entity,
        entityId: evento.entityId,
        user: evento.user ? { email: evento.user.email, name: evento.user.displayName } : null,
        changes: evento.changesJson,
        ip: evento.ip,
        createdAt: evento.createdAt,
      })),
      meta: { page, perPage, total },
    };
  }

  private async exigirUsuario(userId: bigint) {
    const usuario = await this.users.findById(userId);
    if (!usuario) throw new NotFoundError('El usuario no existe.');
    return usuario;
  }

  /** Evita que un admin se deje a sí mismo fuera por accidente. */
  private exigirQueNoSeaUnoMismo(adminId: bigint, userId: bigint, accion: string): void {
    if (adminId === userId) {
      throw new BadRequestError(`No puedes ${accion}.`, { code: 'cannot_target_self' });
    }
  }

  /** Impide quedarse sin ningún administrador y perder el panel para siempre. */
  private async exigirQueQuedeAlgunAdmin(rol: UserRole, userId: bigint): Promise<void> {
    if (rol !== 'admin') return;

    const otrosAdmins = await this.users.countOtherActiveAdmins(userId);

    if (otrosAdmins === 0) {
      throw new BadRequestError(
        'Es el único administrador activo. Nombra otro antes de quitarle el acceso.',
        { code: 'last_active_admin' },
      );
    }
  }
}
