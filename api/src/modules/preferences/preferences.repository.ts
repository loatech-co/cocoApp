import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PreferencesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByUser(userId: bigint): Promise<{ prefKey: string; prefValue: Prisma.JsonValue }[]> {
    return this.prisma.userPreference.findMany({
      where: { userId },
      select: { prefKey: true, prefValue: true },
    });
  }

  /**
   * `upsert` por (user_id, pref_key), que tiene índice único: la operación es
   * idempotente y no hay que preguntar antes si la fila ya existía. Todas en
   * una sola transacción.
   */
  async upsertMany(
    userId: bigint,
    entries: readonly (readonly [string, Prisma.InputJsonValue])[],
  ): Promise<void> {
    await this.prisma.$transaction(
      entries.map(([prefKey, prefValue]) =>
        this.prisma.userPreference.upsert({
          where: { userId_prefKey: { userId, prefKey } },
          create: { userId, prefKey, prefValue },
          update: { prefValue },
        }),
      ),
    );
  }
}
