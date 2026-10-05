import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CategorizationRepository {
  constructor(private readonly prisma: PrismaService) {}

  findRules(userId: bigint): Promise<{ pattern: string; categoryId: bigint; priority: number }[]> {
    return this.prisma.categoryRule.findMany({
      where: { userId },
      select: { pattern: true, categoryId: true, priority: true },
    });
  }

  /** Creates the rule, or points it at the category and counts one more hit. */
  async upsertRule(
    userId: bigint,
    pattern: string,
    categoryId: bigint,
    priority: number,
  ): Promise<void> {
    await this.prisma.categoryRule.upsert({
      where: { userId_pattern: { userId, pattern } },
      create: { userId, pattern, categoryId, priority, hits: 1 },
      update: { categoryId, hits: { increment: 1 } },
    });
  }
}
