import { Injectable } from '@nestjs/common';
import type { Prisma, User, UserStatus } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AdminRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** One page of users. Los pendientes primero: son los que exigen una decisión. */
  findUsers(status: UserStatus | undefined, skip: number, take: number): Promise<User[]> {
    return this.prisma.user.findMany({
      where: status ? { status } : {},
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      skip,
      take,
    });
  }

  countUsers(status: UserStatus | undefined): Promise<number> {
    return this.prisma.user.count({ where: status ? { status } : {} });
  }

  findUser(id: bigint): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  updateUser(id: bigint, data: Prisma.UserUncheckedUpdateInput): Promise<User> {
    return this.prisma.user.update({ where: { id }, data });
  }

  /** Active administrators other than this user. */
  countOtherActiveAdmins(userId: bigint): Promise<number> {
    return this.prisma.user.count({
      where: { role: 'admin', status: 'active', id: { not: userId } },
    });
  }
}
