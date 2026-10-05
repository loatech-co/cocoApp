import { Injectable } from '@nestjs/common';
import type { AuditLog, Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

/** An audit row with who did it, as the admin log lists it. */
export type AuditEntryWithUser = AuditLog & {
  user: { email: string; displayName: string | null } | null;
};

@Injectable()
export class AuditRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.AuditLogUncheckedCreateInput): Promise<void> {
    await this.prisma.auditLog.create({ data });
  }

  /** Newest first, one page. */
  findPage(skip: number, take: number): Promise<AuditEntryWithUser[]> {
    return this.prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: { user: { select: { email: true, displayName: true } } },
    });
  }

  count(): Promise<number> {
    return this.prisma.auditLog.count();
  }
}
