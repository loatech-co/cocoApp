import { Injectable } from '@nestjs/common';
import type { Periodicidad, Prisma, TransactionType } from '@prisma/client';

import { CERO, toMoney, type Money } from '../../common/money/money';
import { PrismaService } from '../../prisma/prisma.service';

/** A category as the summary reads it: tree position and recurrence. */
export interface SummaryCategory {
  id: bigint;
  name: string;
  color: string | null;
  icon: string | null;
  parentId: bigint | null;
  recurrente: boolean;
  periodicidad: Periodicidad | null;
  diaDePago: number | null;
  mesDePago: number | null;
  presupuesto: Prisma.Decimal | null;
  pagoAutomatico: boolean;
  variosPagos: boolean;
  isArchived: boolean;
}

/** A movement of the range, with its splits, as the summary aggregates it. */
export interface SummaryMovement {
  date: Date;
  period: Date;
  type: TransactionType;
  amount: Prisma.Decimal;
  categoryId: bigint | null;
  splits: { categoryId: bigint | null; amount: Prisma.Decimal }[];
}

/** An auto-paid concept, with what decides when and how much to charge. */
export interface AutoPaidConcept {
  id: bigint;
  name: string;
  periodicidad: Periodicidad | null;
  diaDePago: number | null;
  mesDePago: number | null;
  presupuesto: Prisma.Decimal | null;
}

/** Concept id → month (`YYYY-MM`) → what it cost that month. */
export type MonthlyHistory = Map<string, Map<string, Money>>;

/** The summary filters, already resolved to category ids. */
export interface SummaryFilter {
  from: Date;
  to: Date;
  /** Only these categories (a requested branch), or every one when null. */
  branch: bigint[] | null;
  q: string | undefined;
  /** Categories whose NAME matches `q`, with their branch. */
  byName: bigint[];
}

@Injectable()
export class DashboardRepository {
  constructor(private readonly prisma: PrismaService) {}

  findCategories(userId: bigint): Promise<SummaryCategory[]> {
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

  findMovements(userId: bigint, filter: SummaryFilter): Promise<SummaryMovement[]> {
    const { from, to, branch, q, byName } = filter;
    return this.prisma.transaction.findMany({
      where: {
        userId,
        // Por PERÍODO, no por fecha de pago: la factura de marzo pagada el
        // 6 de abril pertenece a marzo, y es en marzo donde uno la busca.
        period: { gte: from, lte: to },
        ...(branch && { categoryId: { in: branch } }),
        ...(q && {
          OR: [
            { description: { contains: q, mode: 'insensitive' as const } },
            { merchant: { contains: q, mode: 'insensitive' as const } },
            { notes: { contains: q, mode: 'insensitive' as const } },
            ...(byName.length > 0 ? [{ categoryId: { in: byName } }] : []),
          ],
        }),
      },
      select: {
        date: true,
        period: true,
        type: true,
        amount: true,
        categoryId: true,
        splits: { select: { categoryId: true, amount: true } },
      },
    });
  }

  /**
   * Cuánto costó cada concepto en cada mes ANTERIOR a `before`. Un mes con
   * dos pagos suma los dos: el mes costó lo que costó, no lo que costó uno de
   * los recibos.
   */
  async monthlyHistory(
    userId: bigint,
    categoryIds: readonly bigint[],
    before: Date,
  ): Promise<MonthlyHistory> {
    const historia = await this.prisma.transaction.findMany({
      where: { userId, categoryId: { in: [...categoryIds] }, period: { lt: before } },
      select: { categoryId: true, amount: true, period: true },
    });

    const historiaDe: MonthlyHistory = new Map();
    for (const t of historia) {
      const clave = t.categoryId?.toString();
      if (clave === undefined) continue;
      const mes = t.period.toISOString().slice(0, 7);
      const meses = historiaDe.get(clave) ?? new Map<string, Money>();
      meses.set(mes, (meses.get(mes) ?? CERO).plus(toMoney(t.amount)));
      historiaDe.set(clave, meses);
    }
    return historiaDe;
  }

  /**
   * Lo ya pagado en ese mes y CONFIRMADO (`cleared`), sumado por concepto: un
   * mismo recurrente puede haberse pagado en dos partes.
   */
  async clearedInMonth(
    userId: bigint,
    categoryIds: readonly bigint[],
    month: Date,
  ): Promise<Map<string, Money>> {
    const pagados = await this.prisma.transaction.findMany({
      where: {
        userId,
        categoryId: { in: [...categoryIds] },
        period: { gte: month, lte: month },
        status: 'cleared',
      },
      select: { categoryId: true, amount: true },
    });

    const pagado = new Map<string, Money>();
    for (const t of pagados) {
      const clave = t.categoryId?.toString();
      if (clave === undefined) continue;
      pagado.set(clave, (pagado.get(clave) ?? CERO).plus(toMoney(t.amount)));
    }
    return pagado;
  }

  findAutoPaidConcepts(userId: bigint): Promise<AutoPaidConcept[]> {
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
  async ownersOfAutoPaidConcepts(): Promise<bigint[]> {
    const owners = await this.prisma.category.findMany({
      where: { recurrente: true, pagoAutomatico: true, isArchived: false },
      select: { userId: true },
      distinct: ['userId'],
    });
    return owners.map((owner) => owner.userId);
  }

  /** Which of these concepts already have a movement in that period, in ANY status. */
  async categoriesWithMovementIn(
    userId: bigint,
    categoryIds: readonly bigint[],
    period: Date,
  ): Promise<Set<string | undefined>> {
    const yaHay = await this.prisma.transaction.findMany({
      where: { userId, categoryId: { in: [...categoryIds] }, period },
      select: { categoryId: true },
    });
    return new Set(yaHay.map((t) => t.categoryId?.toString()));
  }

  /**
   * Writes an automatic charge. `false` when its unique `external_ref` was
   * already taken: two runs racing for the same charge, the first one won.
   */
  async createAutoCharge(data: Prisma.TransactionUncheckedCreateInput): Promise<boolean> {
    try {
      await this.prisma.transaction.create({ data });
      return true;
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') return false;
      throw error;
    }
  }
}
