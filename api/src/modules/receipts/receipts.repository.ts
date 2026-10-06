import { Injectable } from '@nestjs/common';

import type { Prisma, Receipt } from '../../generated/prisma/client';
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
export class ReceiptsRepository {
  constructor(private readonly db: Database) {}

  findByTransaction(userId: bigint, transactionId: bigint): Promise<Receipt[]> {
    return this.db.forUser(userId, (tx) =>
      tx.receipt.findMany({
        where: { userId, transactionId },
        orderBy: [{ position: 'asc' }, { id: 'asc' }],
      }),
    );
  }

  /** The receipt, its movement and its owner, all three in the same `where`. */
  findOne(userId: bigint, transactionId: bigint, receiptId: bigint): Promise<Receipt | null> {
    return this.db.forUser(userId, (tx) =>
      tx.receipt.findFirst({ where: { id: receiptId, transactionId, userId } }),
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
    const last = await this.db.forUser(userId, (tx) =>
      tx.receipt.aggregate({ where: { userId, transactionId }, _max: { position: true } }),
    );
    return last._max.position;
  }

  async existsWithHash(userId: bigint, transactionId: bigint, hash: string): Promise<boolean> {
    const found = await this.db.forUser(userId, (tx) =>
      tx.receipt.findFirst({
        where: { userId, transactionId, contentHash: hash },
        select: { id: true },
      }),
    );
    return found !== null;
  }

  async create(data: Prisma.ReceiptUncheckedCreateInput & { userId: bigint }): Promise<void> {
    await this.db.forUser(data.userId, (tx) => tx.receipt.create({ data }));
  }

  async delete(userId: bigint, transactionId: bigint, receiptId: bigint): Promise<void> {
    await this.db.forUser(userId, (tx) =>
      tx.receipt.deleteMany({ where: { id: receiptId, transactionId, userId } }),
    );
  }

  async storageKeysOf(
    userId: bigint,
    where: { transactionId?: bigint; transferGroupId?: string },
  ): Promise<string[]> {
    const rows = await this.db.forUser(userId, (tx) =>
      tx.receipt.findMany({
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
