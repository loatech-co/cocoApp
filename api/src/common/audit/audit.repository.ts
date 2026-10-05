import { Injectable } from '@nestjs/common';
import type { AuditLog, Prisma } from '@prisma/client';

import { Database } from '../../prisma/database';
import { PrismaService } from '../../prisma/prisma.service';

/** An audit row with who did it, as the admin log lists it. */
export type AuditEntryWithUser = AuditLog & {
  user: { email: string; displayName: string | null } | null;
};

@Injectable()
export class AuditRepository {
  constructor(
    /** Only for `create`: an entry may have no user at all (a failed login). */
    private readonly prisma: PrismaService,
    private readonly db: Database,
  ) {}

  /**
   * Appends, outside any user's unit of work: a failed login has no user and
   * an admin's action is about someone else. The policy lets the API insert
   * and nothing else (ADR 0019).
   *
   * `createMany` and not `create` on purpose: `create` reads the row back
   * (INSERT … RETURNING), and only an admin may read the log.
   */
  async create(data: Prisma.AuditLogUncheckedCreateInput): Promise<void> {
    await this.prisma.auditLog.createMany({ data: [data] });
  }

  /**
   * Newest first, one page, with the total. Read as the admin who asks: the
   * policy shows the log only to an active admin.
   */
  findPage(
    adminId: bigint,
    skip: number,
    take: number,
  ): Promise<{ entries: AuditEntryWithUser[]; total: number }> {
    return this.db.forUser(adminId, async (tx) => {
      const [entries, total] = await Promise.all([
        tx.auditLog.findMany({
          orderBy: { createdAt: 'desc' },
          skip,
          take,
          include: { user: { select: { email: true, displayName: true } } },
        }),
        tx.auditLog.count(),
      ]);
      return { entries, total };
    });
  }
}
