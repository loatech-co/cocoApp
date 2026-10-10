import { Injectable } from '@nestjs/common';

import type { Prisma, User, UserRole, UserStatus } from '../../generated/prisma/client';
import { Database } from '../../prisma/database';
import { PrismaService } from '../../prisma/prisma.service';

/** What the auth guard reads on every request: identity, role and status. */
export type SessionUser = Pick<User, 'id' | 'email' | 'role' | 'status' | 'sessionsValidFrom'>;

@Injectable()
export class UsersRepository {
  constructor(
    private readonly prisma: PrismaService,
    /** Only for `setAccess`: the admin path runs as the admin who acts. */
    private readonly db: Database,
  ) {}

  findByAuthId(authId: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { authId } });
  }

  /** The indexed lookup the guard does per request; only the columns it needs. */
  findSessionUser(authId: string): Promise<SessionUser | null> {
    return this.prisma.user.findUnique({
      where: { authId },
      select: { id: true, email: true, role: true, status: true, sessionsValidFrom: true },
    });
  }

  /** Throws Prisma's P2025 when it does not exist, which the filter answers with 404. */
  findByIdOrThrow(id: bigint): Promise<User> {
    return this.prisma.user.findUniqueOrThrow({ where: { id } });
  }

  create(data: Prisma.UserCreateInput): Promise<User> {
    return this.prisma.user.create({ data });
  }

  /**
   * The columns the app may write itself: `coco_app` holds UPDATE only on
   * `last_login_at`, `sessions_valid_from` and `updated_at` (migration
   * 20261006000300_users_column_privileges). The role and the status go
   * through `setAccess`.
   */
  update(
    id: bigint,
    data: Pick<Prisma.UserUpdateInput, 'lastLoginAt' | 'sessionsValidFrom'>,
  ): Promise<User> {
    return this.prisma.user.update({ where: { id }, data });
  }

  /** One page of users. Pending ones first: they are the ones that need a decision. */
  findPage(status: UserStatus | undefined, skip: number, take: number): Promise<User[]> {
    return this.prisma.user.findMany({
      where: status ? { status } : {},
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      skip,
      take,
    });
  }

  count(status: UserStatus | undefined): Promise<number> {
    return this.prisma.user.count({ where: status ? { status } : {} });
  }

  findById(id: bigint): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  /**
   * Approve, suspend, reactivate or change the role of an account, as the
   * admin `actorId`. Goes through `app_private.set_user_access`, a SECURITY
   * DEFINER function that refuses unless the unit of work runs as an active
   * admin: `coco_app` cannot write `role` or `status` by itself.
   */
  setAccess(
    actorId: bigint,
    targetId: bigint,
    access: { status?: UserStatus; role?: UserRole; approve?: boolean },
  ): Promise<User> {
    return this.db.forUser(actorId, async (tx) => {
      await tx.$executeRaw`SELECT app_private.set_user_access(
        ${targetId},
        ${access.status ?? null}::"UserStatus",
        ${access.role ?? null}::"UserRole",
        ${access.approve === true}
      )`;
      return tx.user.findUniqueOrThrow({ where: { id: targetId } });
    });
  }

  /**
   * Whether any admin exists, in any status. While one does, the database
   * refuses the app a second one (ADR 0027), so the bootstrap is closed.
   */
  async hasAnyAdmin(): Promise<boolean> {
    return (await this.prisma.user.count({ where: { role: 'admin' }, take: 1 })) > 0;
  }

  /** Active administrators other than this user. */
  countOtherActiveAdmins(userId: bigint): Promise<number> {
    return this.prisma.user.count({
      where: { role: 'admin', status: 'active', id: { not: userId } },
    });
  }
}
