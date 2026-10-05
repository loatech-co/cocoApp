import { Injectable } from '@nestjs/common';
import type { Prisma, User } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

/** What the auth guard reads on every request: identity, role and status. */
export type SessionUser = Pick<User, 'id' | 'email' | 'role' | 'status' | 'sessionsValidFrom'>;

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

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

  update(id: bigint, data: Prisma.UserUpdateInput): Promise<User> {
    return this.prisma.user.update({ where: { id }, data });
  }
}
