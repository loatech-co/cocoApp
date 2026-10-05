import { Injectable } from '@nestjs/common';

import type { ListTransactionsQueryDto } from './dto/transaction.dto';
import { parseOrden } from './transactions.sort';
import { idsDeCategorias, ramasDe } from '../../common/categories/categories.tree';
import { DuplicateError } from '../../common/errors/domain-error';
import { toMoney, type Money } from '../../common/money/money';
import { Prisma, type TransactionType } from '../../generated/prisma/client';
import { Database, type UserTx } from '../../prisma/database';

/** Lo que Prisma devuelve cuando se incluyen splits y etiquetas. */
export type TransaccionCompleta = Prisma.TransactionGetPayload<{
  include: { splits: true; tags: { include: { tag: true } } };
}>;

const INCLUIR_TODO = {
  splits: true,
  tags: { include: { tag: true } },
} as const;

/** A split ready to write: amounts already checked against the header. */
export interface SplitToWrite {
  categoryId: bigint | null;
  amount: Money;
  note: string | null;
}

/** The columns a PATCH writes on one movement. */
export type TransactionChanges = Prisma.TransactionUncheckedUpdateInput;

/** The other leg of a transfer being edited, and what it has to take too. */
export interface TransferPartner {
  userId: bigint;
  transferGroupId: string;
  changes: TransactionChanges;
}

/**
 * Every multi-row write here is ONE repository method that runs its whole
 * unit of work inside one `forUser` transaction: a movement never exists without
 * its splits and tags, and a transfer never has one leg without the other.
 */
@Injectable()
export class TransactionsRepository {
  constructor(private readonly db: Database) {}

  /**
   * One page of the filtered list, its total, and the sums by type.
   *
   * Las sumas las hace la BASE, sobre el filtro entero. Traerlas sumando en
   * memoria obligaría a descargar todas las filas del filtro —no las
   * cincuenta de la página— solo para pintar un pie de tabla.
   */
  async findPage(
    userId: bigint,
    query: ListTransactionsQueryDto,
    page: { skip: number; take: number },
  ): Promise<{
    rows: TransaccionCompleta[];
    total: number;
    sumOf: (type: TransactionType) => Money;
  }> {
    const [rows, total, sums] = await this.db.forUser(userId, async (tx) => {
      const where = await this.buildWhere(tx, userId, query);
      return Promise.all([
        tx.transaction.findMany({
          where,
          include: INCLUIR_TODO,
          orderBy: parseOrden(query.sort),
          skip: page.skip,
          take: page.take,
        }),
        tx.transaction.count({ where }),
        tx.transaction.groupBy({ by: ['type'], where, _sum: { amount: true } }),
      ]);
    });

    const sumOf = (type: TransactionType): Money =>
      toMoney(sums.find((s) => s.type === type)?._sum.amount ?? 0);
    return { rows, total, sumOf };
  }

  async periodRange(userId: bigint): Promise<{ first: Date | null; last: Date | null }> {
    const extremos = await this.db.forUser(userId, (tx) =>
      tx.transaction.aggregate({
        where: { userId },
        _min: { period: true },
        _max: { period: true },
      }),
    );
    return { first: extremos._min.period, last: extremos._max.period };
  }

  findOwned(userId: bigint, id: bigint): Promise<TransaccionCompleta | null> {
    return this.db.forUser(userId, (tx) =>
      tx.transaction.findFirst({ where: { id, userId }, include: INCLUIR_TODO }),
    );
  }

  /**
   * Todo dentro de una sola transacción: si algo falla a medio camino, no
   * queda un movimiento huérfano sin su desglose.
   *
   * A clash on the unique `external_ref` becomes a DuplicateError: a client
   * retrying the same capture is told "it is already there".
   */
  async createWithDetails(
    data: Prisma.TransactionUncheckedCreateInput & { userId: bigint },
    splits: readonly SplitToWrite[],
    tagIds: readonly bigint[],
  ): Promise<TransaccionCompleta> {
    try {
      return await this.db.forUser(data.userId, async (tx) => {
        const movimiento = await tx.transaction.create({ data });
        await writeDetails(tx, movimiento.id, splits, tagIds);
        return tx.transaction.findUniqueOrThrow({
          where: { id: movimiento.id },
          include: INCLUIR_TODO,
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new DuplicateError();
      }
      throw error;
    }
  }

  /** Las dos patas en la misma transacción, devueltas en orden (`in`, `out`). */
  createTransfer(
    base: Omit<Prisma.TransactionUncheckedCreateInput, 'accountId' | 'transferDir'> & {
      userId: bigint;
      transferGroupId: string;
    },
    origen: bigint,
    destino: bigint,
  ): Promise<TransaccionCompleta[]> {
    return this.db.forUser(base.userId, async (tx) => {
      await tx.transaction.create({ data: { ...base, accountId: origen, transferDir: 'out' } });
      await tx.transaction.create({ data: { ...base, accountId: destino, transferDir: 'in' } });

      return tx.transaction.findMany({
        where: { userId: base.userId, transferGroupId: base.transferGroupId },
        include: INCLUIR_TODO,
        orderBy: { transferDir: 'asc' },
      });
    });
  }

  /**
   * `null` splits or tags leave them as they are; a list replaces them.
   *
   * With a `partner`, the other leg of the transfer takes its changes in the
   * SAME transaction: if its write fails, this one is rolled back too, and the
   * two legs never disagree on the amount or the date.
   */
  updateWithDetails(
    userId: bigint,
    id: bigint,
    data: TransactionChanges,
    splits: readonly SplitToWrite[] | null,
    tagIds: readonly bigint[] | null,
    partner: TransferPartner | null = null,
  ): Promise<TransaccionCompleta> {
    return this.db.forUser(userId, async (tx) => {
      await tx.transaction.update({ where: { id }, data });
      if (partner !== null && Object.keys(partner.changes).length > 0) {
        await tx.transaction.updateMany({
          where: {
            userId: partner.userId,
            transferGroupId: partner.transferGroupId,
            id: { not: id },
          },
          data: partner.changes,
        });
      }

      if (splits !== null) await tx.transactionSplit.deleteMany({ where: { transactionId: id } });
      if (tagIds !== null) await tx.transactionTag.deleteMany({ where: { transactionId: id } });
      await writeDetails(tx, id, splits ?? [], tagIds ?? []);

      return tx.transaction.findUniqueOrThrow({ where: { id }, include: INCLUIR_TODO });
    });
  }

  /** The account of the OTHER leg of a transfer, or null when it has none. */
  async partnerAccount(
    userId: bigint,
    transferGroupId: string,
    id: bigint,
  ): Promise<bigint | null> {
    const otra = await this.db.forUser(userId, (tx) =>
      tx.transaction.findFirst({
        where: { userId, transferGroupId, id: { not: id } },
        select: { accountId: true },
      }),
    );
    return otra?.accountId ?? null;
  }

  async deleteTransferGroup(userId: bigint, transferGroupId: string): Promise<void> {
    await this.db.forUser(userId, (tx) =>
      tx.transaction.deleteMany({ where: { userId, transferGroupId } }),
    );
  }

  async deleteOne(userId: bigint, id: bigint): Promise<void> {
    await this.db.forUser(userId, (tx) => tx.transaction.deleteMany({ where: { id, userId } }));
  }

  async accountBelongsTo(userId: bigint, accountId: bigint): Promise<boolean> {
    const count = await this.db.forUser(userId, (tx) =>
      tx.account.count({ where: { id: accountId, userId } }),
    );
    return count > 0;
  }

  async categoryBelongsTo(userId: bigint, categoryId: bigint): Promise<boolean> {
    const count = await this.db.forUser(userId, (tx) =>
      tx.category.count({ where: { id: categoryId, userId } }),
    );
    return count > 0;
  }

  /** True only when EVERY id in `categoryIds` is one of the user's categories. Empty is true. */
  async categoriesBelongTo(userId: bigint, categoryIds: readonly bigint[]): Promise<boolean> {
    const unique = [...new Set(categoryIds)];
    if (unique.length === 0) return true;
    const owned = await this.db.forUser(userId, (tx) =>
      tx.category.count({ where: { id: { in: unique }, userId } }),
    );
    return owned === unique.length;
  }

  private async buildWhere(
    tx: UserTx,
    userId: bigint,
    query: ListTransactionsQueryDto,
  ): Promise<Prisma.TransactionWhereInput> {
    const where: Prisma.TransactionWhereInput = { userId, ...plainFilters(query) };

    const pedidas = [
      ...(query.category_id !== undefined ? [BigInt(query.category_id)] : []),
      ...idsDeCategorias(query.category_ids),
    ];
    // Filtrar por "Costos fijos" tiene que traer TODO lo que hay debajo: los
    // movimientos cuelgan del concepto, que es la hoja.
    if (pedidas.length > 0) {
      where.categoryId = { in: ramasDe(await categoryNodes(tx, userId), pedidas) };
    }

    if (query.q) {
      // La búsqueda también entra por la CLASIFICACIÓN: escribir "servicios
      // públicos" tiene que traer todo lo que cuelga de esa categoría, aunque
      // ninguna fila lo diga en su descripción. Quien busca piensa en el
      // nombre con el que ordenó su plata, no en cómo vino escrito el cargo.
      const porClasificacion = await branchByName(tx, userId, query.q);

      // `mode: 'insensitive'` NO es opcional. Postgres compara distinguiendo
      // mayúsculas —MariaDB no lo hacía—, así que buscar "celsia" no
      // encontraría "Celsia (Energia)". Quien busca escribe en minúscula.
      where.OR = [
        { description: { contains: query.q, mode: 'insensitive' } },
        { merchant: { contains: query.q, mode: 'insensitive' } },
        { notes: { contains: query.q, mode: 'insensitive' } },
        ...(porClasificacion.length > 0 ? [{ categoryId: { in: porClasificacion } }] : []),
      ];
    }

    return where;
  }
}

function categoryNodes(
  tx: UserTx,
  userId: bigint,
): Promise<{ id: bigint; parentId: bigint | null; name: string }[]> {
  return tx.category.findMany({
    where: { userId },
    select: { id: true, parentId: true, name: true },
  });
}

/**
 * Las categorías cuyo NOMBRE contiene el texto, con toda su rama.
 *
 * Con la rama, no solo las que coinciden: los movimientos cuelgan del
 * concepto, así que buscar el nombre de una categoría sin expandirla no
 * devolvería ni una fila.
 */
async function branchByName(tx: UserTx, userId: bigint, texto: string): Promise<bigint[]> {
  const todas = await categoryNodes(tx, userId);
  const aguja = texto.toLowerCase();
  const coinciden = todas.filter((c) => c.name.toLowerCase().includes(aguja)).map((c) => c.id);
  return coinciden.length === 0 ? [] : ramasDe(todas, coinciden);
}

/** The filters that need no lookup: period, account, type, status, tag, amount. */
function plainFilters(query: ListTransactionsQueryDto): Prisma.TransactionWhereInput {
  return {
    // Por PERÍODO: el rango que la persona elige arriba se refiere al mes al
    // que pertenece el gasto, no al día en que salió la plata. Si filtrara
    // por `date`, marzo aparecería vacío cuando sus facturas se pagaron en
    // abril — que es exactamente lo que pasaba.
    ...((query.from || query.to) && {
      period: {
        ...(query.from && { gte: new Date(query.from) }),
        ...(query.to && { lte: new Date(query.to) }),
      },
    }),
    ...(query.account_id !== undefined && { accountId: BigInt(query.account_id) }),
    ...(query.type && { type: query.type }),
    ...(query.status && { status: query.status }),
    ...(query.tag_id !== undefined && { tags: { some: { tagId: BigInt(query.tag_id) } } }),
    ...((query.min_amount || query.max_amount) && {
      amount: {
        ...(query.min_amount && { gte: toMoney(query.min_amount) }),
        ...(query.max_amount && { lte: toMoney(query.max_amount) }),
      },
    }),
  };
}

/** A movement's splits and tags, inside the transaction that wrote it. Also used by the capture. */
export async function writeDetails(
  tx: Prisma.TransactionClient,
  transactionId: bigint,
  splits: readonly SplitToWrite[],
  tagIds: readonly bigint[],
): Promise<void> {
  if (splits.length > 0) {
    await tx.transactionSplit.createMany({
      data: splits.map((split) => ({
        transactionId,
        categoryId: split.categoryId,
        amount: split.amount,
        note: split.note,
      })),
    });
  }
  if (tagIds.length > 0) {
    await tx.transactionTag.createMany({
      data: tagIds.map((tagId) => ({ transactionId, tagId })),
    });
  }
}
