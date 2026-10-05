import { Injectable } from '@nestjs/common';

import type {
  AutoCharge,
  DuplicateCandidateRow,
  DuplicateCriteria,
  EnrichChanges,
  MonthlyHistory,
  SummaryFilter,
  SummaryMovement,
} from './ledger.types';
import { CERO, toMoney, type Money } from '../../common/money/money';
import { PrismaService } from '../../prisma/prisma.service';

/** The reads and writes other modules need from the transactions table. */
@Injectable()
export class LedgerRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findIdByExternalRef(userId: bigint, externalRef: string): Promise<bigint | null> {
    const fila = await this.prisma.transaction.findFirst({
      where: { userId, externalRef },
      select: { id: true },
    });
    return fila?.id ?? null;
  }

  async enrich(id: bigint, changes: EnrichChanges): Promise<void> {
    await this.prisma.transaction.update({ where: { id }, data: changes });
  }

  /** Sin hora de captura, por la de creación. A lo sumo veinte. */
  findDuplicateCandidates(criteria: DuplicateCriteria): Promise<DuplicateCandidateRow[]> {
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

  /** The most recent categorized movements with a description, newest first. */
  findCategorizedHistory(
    userId: bigint,
    take: number,
  ): Promise<{ description: string | null; categoryId: bigint | null }[]> {
    return this.prisma.transaction.findMany({
      where: { userId, categoryId: { not: null }, description: { not: null } },
      select: { description: true, categoryId: true },
      orderBy: { date: 'desc' },
      take,
    });
  }

  findForSummary(userId: bigint, filter: SummaryFilter): Promise<SummaryMovement[]> {
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
   *
   * Solo lo que la estimación lee (ADR 0017): los meses desde `since`, y para
   * el concepto que no tiene nada ahí, su ÚLTIMO mes con pago, que es a lo que
   * cae la estimación. Antes se traía la historia entera y el resumen se
   * volvía más lento con cada año de datos sin que cambiara ninguna cifra.
   */
  async monthlyHistory(
    userId: bigint,
    categoryIds: readonly bigint[],
    { before, since }: { before: Date; since: Date },
  ): Promise<MonthlyHistory> {
    // El último periodo de cada concepto: un agregado en la base, sin traer filas.
    const ultimos = await this.prisma.transaction.groupBy({
      by: ['categoryId'],
      where: { userId, categoryId: { in: [...categoryIds] }, period: { lt: before } },
      _max: { period: true },
    });

    const tramos = ultimos.flatMap(({ categoryId, _max }) =>
      categoryId === null || _max.period === null
        ? []
        : [{ categoryId, period: { gte: desdeParaElConcepto(_max.period, since), lt: before } }],
    );
    if (tramos.length === 0) return new Map();

    const historia = await this.prisma.transaction.findMany({
      where: { userId, OR: tramos },
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
  async createAutoCharge(charge: AutoCharge): Promise<boolean> {
    try {
      await this.prisma.transaction.create({
        data: { ...charge, type: 'expense', status: 'cleared' },
      });
      return true;
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') return false;
      throw error;
    }
  }
}

/**
 * From where a concept's history has to be read: `since` when its last payment
 * falls inside the window, or the first day of the month of that last payment
 * when it is older, so the fallback month comes back whole.
 */
function desdeParaElConcepto(ultimo: Date, since: Date): Date {
  const mesDelUltimo = new Date(Date.UTC(ultimo.getUTCFullYear(), ultimo.getUTCMonth(), 1));
  return mesDelUltimo < since ? mesDelUltimo : since;
}
