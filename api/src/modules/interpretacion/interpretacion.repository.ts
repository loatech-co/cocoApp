import { Injectable } from '@nestjs/common';
import type { Prisma, TransactionSource } from '@prisma/client';

import type { Money } from '../../common/money/money';
import { PrismaService } from '../../prisma/prisma.service';

/** A category the person picked by hand, with what decides if it can classify. */
export interface ChosenCategory {
  id: bigint;
  name: string;
  isArchived: boolean;
  parent: { id: bigint; parentId: bigint | null } | null;
}

/** A movement that might be the other side of the same payment. */
export interface DuplicateCandidateRow {
  id: bigint;
  source: TransactionSource;
  date: Date;
  amount: Prisma.Decimal;
  capturedAt: Date | null;
  createdAt: Date;
  rawText: string | null;
  merchant: string | null;
  description: string | null;
}

@Injectable()
export class InterpretacionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findIdByExternalRef(userId: bigint, externalRef: string): Promise<bigint | null> {
    const fila = await this.prisma.transaction.findFirst({
      where: { userId, externalRef },
      select: { id: true },
    });
    return fila?.id ?? null;
  }

  async enrichTransaction(id: bigint, changes: Prisma.TransactionUpdateInput): Promise<void> {
    await this.prisma.transaction.update({ where: { id }, data: changes });
  }

  /** The same answer for "does not exist" and "is not yours": null. */
  findChosenCategory(userId: bigint, id: bigint): Promise<ChosenCategory | null> {
    return this.prisma.category.findFirst({
      where: { id, userId },
      select: {
        id: true,
        name: true,
        isArchived: true,
        parent: { select: { id: true, parentId: true } },
      },
    });
  }

  /** The person's live tree, flat, in their order. */
  findActiveCategories(
    userId: bigint,
  ): Promise<{ id: bigint; parentId: bigint | null; name: string; palabrasClave: string[] }[]> {
    return this.prisma.category.findMany({
      where: { userId, isArchived: false },
      select: { id: true, parentId: true, name: true, palabrasClave: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  /**
   * Misma persona, mismo monto, otro origen, cerca en fecha —`days`— y en
   * tiempo de captura —`window`—; sin hora de captura, por la de creación.
   */
  findDuplicateCandidates(criteria: {
    userId: bigint;
    source: TransactionSource;
    amount: Money;
    days: { from: Date; to: Date };
    window: { from: Date; to: Date };
  }): Promise<DuplicateCandidateRow[]> {
    const { userId, source, amount, days, window } = criteria;
    return this.prisma.transaction.findMany({
      where: {
        userId,
        amount,
        source: { not: source },
        date: { gte: days.from, lte: days.to },
        OR: [
          { capturedAt: { gte: window.from, lte: window.to } },
          { capturedAt: null, createdAt: { gte: window.from, lte: window.to } },
        ],
      },
      select: {
        id: true,
        source: true,
        date: true,
        amount: true,
        capturedAt: true,
        createdAt: true,
        rawText: true,
        merchant: true,
        description: true,
      },
      take: 20,
    });
  }
}
