import { Injectable } from '@nestjs/common';

import type {
  AutoPaidConcept,
  ChosenCategory,
  SearchableCategory,
  SummaryCategory,
} from './category-lookup.types';
import { PrismaService } from '../../prisma/prisma.service';

/** The reads other modules need from the categories table. */
@Injectable()
export class CategoryLookupRepository {
  constructor(private readonly prisma: PrismaService) {}

  async isOwn(userId: bigint, categoryId: bigint): Promise<boolean> {
    const own = await this.prisma.category.findFirst({
      where: { id: categoryId, userId },
      select: { id: true },
    });
    return own !== null;
  }

  /** The same answer for "does not exist" and "is not yours": null. */
  findChosen(userId: bigint, id: bigint): Promise<ChosenCategory | null> {
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
  findSearchable(userId: bigint): Promise<SearchableCategory[]> {
    return this.prisma.category.findMany({
      where: { userId, isArchived: false },
      select: { id: true, parentId: true, name: true, palabrasClave: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  findForSummary(userId: bigint): Promise<SummaryCategory[]> {
    return this.prisma.category.findMany({
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
    });
  }

  findAutoPaid(userId: bigint): Promise<AutoPaidConcept[]> {
    return this.prisma.category.findMany({
      where: { userId, recurrente: true, pagoAutomatico: true, isArchived: false },
      select: {
        id: true,
        name: true,
        periodicidad: true,
        diaDePago: true,
        mesDePago: true,
        presupuesto: true,
      },
    });
  }

  /** Users with at least one live auto-paid concept. */
  async ownersOfAutoPaid(): Promise<bigint[]> {
    const owners = await this.prisma.category.findMany({
      where: { recurrente: true, pagoAutomatico: true, isArchived: false },
      select: { userId: true },
      distinct: ['userId'],
    });
    return owners.map((owner) => owner.userId);
  }
}
