import { Injectable } from '@nestjs/common';

import type {
  AutoPaidConcept,
  ChosenCategory,
  SearchableCategory,
  SummaryCategory,
} from './category-lookup.types';
import { Database } from '../../prisma/database';
import { PrismaService } from '../../prisma/prisma.service';

/** The reads other modules need from the categories table. */
@Injectable()
export class CategoryLookupRepository {
  constructor(
    private readonly db: Database,
    /** Only for `ownersOfAutoPaid`, the one read that crosses users. */
    private readonly prisma: PrismaService,
  ) {}

  async isOwn(userId: bigint, categoryId: bigint): Promise<boolean> {
    const own = await this.db.forUser(userId, (tx) =>
      tx.category.findFirst({ where: { id: categoryId, userId }, select: { id: true } }),
    );
    return own !== null;
  }

  /** The same answer for "does not exist" and "is not yours": null. */
  findChosen(userId: bigint, id: bigint): Promise<ChosenCategory | null> {
    return this.db.forUser(userId, (tx) =>
      tx.category.findFirst({
        where: { id, userId },
        select: {
          id: true,
          name: true,
          isArchived: true,
          parent: { select: { id: true, parentId: true } },
        },
      }),
    );
  }

  /** The person's live tree, flat, in their order. */
  findSearchable(userId: bigint): Promise<SearchableCategory[]> {
    return this.db.forUser(userId, (tx) =>
      tx.category.findMany({
        where: { userId, isArchived: false },
        select: { id: true, parentId: true, name: true, palabrasClave: true },
        orderBy: { sortOrder: 'asc' },
      }),
    );
  }

  findForSummary(userId: bigint): Promise<SummaryCategory[]> {
    return this.db.forUser(userId, (tx) =>
      tx.category.findMany({
        where: { userId },
        select: {
          id: true,
          name: true,
          color: true,
          icon: true,
          parentId: true,
          recurrente: true,
          periodicidad: true,
          diaDePago: true,
          mesDePago: true,
          presupuesto: true,
          pagoAutomatico: true,
          variosPagos: true,
          isArchived: true,
        },
      }),
    );
  }

  findAutoPaid(userId: bigint): Promise<AutoPaidConcept[]> {
    return this.db.forUser(userId, (tx) =>
      tx.category.findMany({
        where: { userId, recurrente: true, pagoAutomatico: true, isArchived: false },
        select: {
          id: true,
          name: true,
          periodicidad: true,
          diaDePago: true,
          mesDePago: true,
          presupuesto: true,
        },
      }),
    );
  }

  /**
   * Users with at least one live auto-paid concept.
   *
   * The only read that crosses users, so it cannot run inside `forUser`: it
   * calls `app_private.auto_paid_owner_ids()`, a SECURITY DEFINER function
   * that returns ids and nothing else (migration
   * 20261006000000_add_row_level_security, ADR 0019). Each charge then runs
   * as its owner.
   */
  async ownersOfAutoPaid(): Promise<bigint[]> {
    const owners = await this.prisma.$queryRaw<{ id: bigint }[]>`
      SELECT id FROM app_private.auto_paid_owner_ids() AS id`;
    return owners.map((owner) => owner.id);
  }
}
