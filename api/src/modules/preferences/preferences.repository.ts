import { Injectable } from '@nestjs/common';

import type { Prisma } from '../../generated/prisma/client';
import { Database } from '../../prisma/database';

@Injectable()
export class PreferencesRepository {
  constructor(private readonly db: Database) {}

  findByUser(userId: bigint): Promise<{ prefKey: string; prefValue: Prisma.JsonValue }[]> {
    return this.db.forUser(userId, (tx) =>
      tx.userPreference.findMany({
        where: { userId },
        select: { prefKey: true, prefValue: true },
      }),
    );
  }

  /**
   * `upsert` on (user_id, pref_key), which has a unique index: the operation
   * is idempotent and there is no need to ask first whether the row existed.
   * All in one transaction.
   */
  async upsertMany(
    userId: bigint,
    entries: readonly (readonly [string, Prisma.InputJsonValue])[],
  ): Promise<void> {
    await this.db.forUser(userId, async (tx) => {
      for (const [prefKey, prefValue] of entries) {
        await tx.userPreference.upsert({
          where: { userId_prefKey: { userId, prefKey } },
          create: { userId, prefKey, prefValue },
          update: { prefValue },
        });
      }
    });
  }
}
