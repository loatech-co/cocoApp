import { Injectable } from '@nestjs/common';
import type { Prisma, Soporte } from '@prisma/client';

import { Database } from '../../prisma/database';

/** What an upload needs to know about the movement it attaches to. */
export interface MovementForUpload {
  description: string | null;
  merchant: string | null;
  date: Date;
  category: { name: string } | null;
}

/**
 * Every query carries the owner in its `where`: a receipt of someone else's
 * movement does not exist for these queries, so no branch can skip the check.
 */
@Injectable()
export class SoportesRepository {
  constructor(private readonly db: Database) {}

  findByTransaction(userId: bigint, transactionId: bigint): Promise<Soporte[]> {
    return this.db.forUser(userId, (tx) =>
      tx.soporte.findMany({
        where: { userId, transactionId },
        orderBy: [{ orden: 'asc' }, { id: 'asc' }],
      }),
    );
  }

  /** The receipt, its movement and its owner, all three in the same `where`. */
  findOne(userId: bigint, transactionId: bigint, soporteId: bigint): Promise<Soporte | null> {
    return this.db.forUser(userId, (tx) =>
      tx.soporte.findFirst({ where: { id: soporteId, transactionId, userId } }),
    );
  }

  findMovementForUpload(userId: bigint, transactionId: bigint): Promise<MovementForUpload | null> {
    return this.db.forUser(userId, (tx) =>
      tx.transaction.findFirst({
        where: { id: transactionId, userId },
        select: {
          description: true,
          merchant: true,
          date: true,
          category: { select: { name: true } },
        },
      }),
    );
  }

  async maxOrder(userId: bigint, transactionId: bigint): Promise<number | null> {
    const ultimo = await this.db.forUser(userId, (tx) =>
      tx.soporte.aggregate({ where: { userId, transactionId }, _max: { orden: true } }),
    );
    return ultimo._max.orden;
  }

  async existsWithHash(userId: bigint, transactionId: bigint, huella: string): Promise<boolean> {
    const found = await this.db.forUser(userId, (tx) =>
      tx.soporte.findFirst({ where: { userId, transactionId, huella }, select: { id: true } }),
    );
    return found !== null;
  }

  async create(data: Prisma.SoporteUncheckedCreateInput & { userId: bigint }): Promise<void> {
    await this.db.forUser(data.userId, (tx) => tx.soporte.create({ data }));
  }

  async delete(userId: bigint, transactionId: bigint, soporteId: bigint): Promise<void> {
    await this.db.forUser(userId, (tx) =>
      tx.soporte.deleteMany({ where: { id: soporteId, transactionId, userId } }),
    );
  }

  async storageKeysOf(
    userId: bigint,
    where: { transactionId?: bigint; transferGroupId?: string },
  ): Promise<string[]> {
    const rows = await this.db.forUser(userId, (tx) =>
      tx.soporte.findMany({
        where: {
          userId,
          transaction: {
            userId,
            ...(where.transactionId !== undefined && { id: where.transactionId }),
            ...(where.transferGroupId !== undefined && { transferGroupId: where.transferGroupId }),
          },
        },
        select: { storageKey: true },
      }),
    );
    return rows.map((row) => row.storageKey);
  }
}
