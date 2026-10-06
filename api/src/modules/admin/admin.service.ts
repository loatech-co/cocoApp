import { Injectable } from '@nestjs/common';

import { AuditService } from '../../common/audit/audit.service';
import { BadRequestError, NotFoundError, ValidationError } from '../../common/errors/domain-error';
import type { Prisma, UserRole, UserStatus } from '../../generated/prisma/client';
import { profileOf, AuthService, type Profile } from '../auth/auth.service';
import { PasswordService } from '../auth/password.service';
import { SupabaseAuthService } from '../auth/supabase-auth.service';
import { UsersService } from '../auth/users.service';

interface RequestContext {
  ip?: string | null;
  userAgent?: string | null;
}

/** Which page of a list the database pages; the first, of 50, when not said. */
export interface PageRequest {
  page?: number | undefined;
  perPage?: number | undefined;
}

/** Which users to list. */
export interface UserFilters extends PageRequest {
  status?: UserStatus | undefined;
}

/** A page of a list the database pages: the domain, before any version names it. */
interface Paged<T> {
  data: T[];
  meta: { page: number; perPage: number; total: number };
}

export type UserPage = Paged<Profile>;

/** One entry of the audit log, as the service hands it out. */
interface AuditEntry {
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

  async listUsers(filters: UserFilters): Promise<UserPage> {
    const page = filters.page ?? 1;
    const perPage = filters.perPage ?? 50;
    const { users, total } = await this.users.page(filters.status, (page - 1) * perPage, perPage);

    return {
      data: users.map(profileOf),
      meta: { page, perPage, total },
    };
  }

  async approve(adminId: bigint, userId: bigint, context: RequestContext): Promise<Profile> {
    const user = await this.requireUser(userId);

    if (user.status === 'active') {
      throw new BadRequestError('Esa cuenta ya está activa.', { code: 'user_already_active' });
    }

    const updated = await this.users.approve(adminId, userId);

    await this.audit.record({
      userId: adminId,
      entity: 'users',
      entityId: userId,
      action: 'admin.user_approved',
      changes: { de: user.status, a: 'active' },
      ...context,
    });

    return profileOf(updated);
  }

  /**
   * Suspending cuts access AT ONCE: besides changing the status, it revokes
   * every session. Without that, whoever already had an access token would
   * keep getting in until it expired.
   */
  async suspend(adminId: bigint, userId: bigint, context: RequestContext): Promise<Profile> {
    this.requireNotSelf(adminId, userId, 'suspenderte a ti mismo');
    const user = await this.requireUser(userId);
    await this.requireAnotherAdmin(user.role, userId);

    const updated = await this.users.setStatus(adminId, userId, 'suspended');
    await this.auth.revokeAllSessions(userId);

    await this.audit.record({
      userId: adminId,
      entity: 'users',
      entityId: userId,
      action: 'admin.user_suspended',
      changes: { de: user.status, a: 'suspended' },
      ...context,
    });

    return profileOf(updated);
  }

  async reactivate(adminId: bigint, userId: bigint, context: RequestContext): Promise<Profile> {
    const user = await this.requireUser(userId);

    const updated = await this.users.setStatus(adminId, userId, 'active');

    await this.audit.record({
      userId: adminId,
      entity: 'users',
      entityId: userId,
      action: 'admin.user_reactivated',
      changes: { de: user.status, a: 'active' },
      ...context,
    });

    return profileOf(updated);
  }

  async changeRole(
    adminId: bigint,
    userId: bigint,
    role: UserRole,
    context: RequestContext,
  ): Promise<Profile> {
    this.requireNotSelf(adminId, userId, 'cambiar tu propio rol');
    const user = await this.requireUser(userId);

    if (user.role === 'admin' && role === 'user') {
      await this.requireAnotherAdmin(user.role, userId);
    }

    const updated = await this.users.setRole(adminId, userId, role);

    // The role is read from the database on every request, so the change
    // already applies. The sessions are closed anyway: a change of permissions
    // deserves the person signing in again and seeing their new context fresh.
    await this.auth.revokeAllSessions(userId);

    await this.audit.record({
      userId: adminId,
      entity: 'users',
      entityId: userId,
      action: 'admin.role_changed',
      changes: { de: user.role, a: role },
      ...context,
    });

    return profileOf(updated);
  }

  /**
   * Resets another account's password.
   *
   * It exists because the free plan's email sending is not enough for a
   * reliable self-service recovery: the admin is the way back for whoever
   * forgets their password.
   * It is a powerful operation, so it is audited, and it closes every session
   * of that person.
   */
  async resetPassword(
    adminId: bigint,
    userId: bigint,
    newPassword: string,
    context: RequestContext,
  ): Promise<void> {
    const user = await this.requireUser(userId);

    await this.passwords.requireStrong(newPassword, {
      email: user.email,
      displayName: user.displayName ?? undefined,
    });

    // Supabase keeps the password; not a trace of it stays here.
    if (!user.authId) {
      throw new ValidationError(
        'Esta cuenta no tiene credenciales gestionadas y no se le puede restablecer la contraseña.',
        { code: 'password_reset_not_managed' },
      );
    }
    await this.supabase.changePassword(user.authId, newPassword);
    await this.auth.revokeAllSessions(userId);

    await this.audit.record({
      userId: adminId,
      entity: 'users',
      entityId: userId,
      action: 'admin.password_reset',
      ...context,
    });
  }

  /** The query arrives as URL text: hence the `Number`. */
  async auditLog(adminId: bigint, request: PageRequest): Promise<AuditPage> {
    const page = request.page ?? 1;
    const perPage = request.perPage ?? 50;

    const { entries, total } = await this.audit.page(adminId, (page - 1) * perPage, perPage);

    return {
      data: entries.map((entry) => ({
        id: entry.id,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
        user: entry.user ? { email: entry.user.email, name: entry.user.displayName } : null,
        changes: entry.changesJson,
        ip: entry.ip,
        createdAt: entry.createdAt,
      })),
      meta: { page, perPage, total },
    };
  }

  private async requireUser(userId: bigint) {
    const user = await this.users.findById(userId);
    if (!user) throw new NotFoundError('El usuario no existe.');
    return user;
  }

  /** Keeps an admin from locking themselves out by accident. */
  private requireNotSelf(adminId: bigint, userId: bigint, action: string): void {
    if (adminId === userId) {
      throw new BadRequestError(`No puedes ${action}.`, { code: 'cannot_target_self' });
    }
  }

  /** Prevents ending up with no admin and losing the panel forever. */
  private async requireAnotherAdmin(role: UserRole, userId: bigint): Promise<void> {
    if (role !== 'admin') return;

    const otherAdmins = await this.users.countOtherActiveAdmins(userId);

    if (otherAdmins === 0) {
      throw new BadRequestError(
        'Es el único administrador activo. Nombra otro antes de quitarle el acceso.',
        { code: 'last_active_admin' },
      );
    }
  }
}
