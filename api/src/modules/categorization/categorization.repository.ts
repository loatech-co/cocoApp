import { Injectable } from '@nestjs/common';

import { Database } from '../../prisma/database';

@Injectable()
export class CategorizationRepository {
  constructor(private readonly db: Database) {}

  findRules(userId: bigint): Promise<{ pattern: string; categoryId: bigint; priority: number }[]> {
    return this.db.forUser(userId, (tx) =>
      tx.categoryRule.findMany({
        where: { userId },
        select: { pattern: true, categoryId: true, priority: true },
      }),
    );
  }

  /** Creates the rule, or points it at the category and counts one more hit. */
  async upsertRule(
    userId: bigint,
    pattern: string,
    categoryId: bigint,
    priority: number,
  ): Promise<void> {
    await this.db.forUser(userId, (tx) =>
      tx.categoryRule.upsert({
        where: { userId_pattern: { userId, pattern } },
        create: { userId, pattern, categoryId, priority, hits: 1 },
        update: { categoryId, hits: { increment: 1 } },
      }),
    );
  }
}
