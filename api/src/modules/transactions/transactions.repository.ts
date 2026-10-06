import { Injectable } from '@nestjs/common';

import type { TransactionFilters } from './transactions.domain';
import { parseOrder } from './transactions.sort';
import { categoryIds, branchesOf } from '../../common/categories/categories.tree';
import { DuplicateError } from '../../common/errors/domain-error';
import { toMoney, type Money } from '../../common/money/money';
import { Prisma, type TransactionType } from '../../generated/prisma/client';
import { Database, type UserTx } from '../../prisma/database';

/** What Prisma returns when splits and tags are included. */
export type FullTransaction = Prisma.TransactionGetPayload<{
  include: { splits: true; tags: { include: { tag: true } } };
}>;

const INCLUDE_ALL = {
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
   * The DATABASE does the sums, over the whole filter. Adding them up in memory
   * would mean downloading every row of the filter —not the fifty of the
   * page— just to paint a table footer.
   */
  async findPage(
    userId: bigint,
    query: TransactionFilters,
    page: { skip: number; take: number },
  ): Promise<{
    rows: FullTransaction[];
    total: number;
    sumOf: (type: TransactionType) => Money;
  }> {
    const [rows, total, sums] = await this.db.forUser(userId, async (tx) => {
      const where = await this.buildWhere(tx, userId, query);
      return Promise.all([
        tx.transaction.findMany({
          where,
          include: INCLUDE_ALL,
          orderBy: parseOrder(query.sort),
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
    const bounds = await this.db.forUser(userId, (tx) =>
      tx.transaction.aggregate({
        where: { userId },
        _min: { period: true },
        _max: { period: true },
      }),
    );
    return { first: bounds._min.period, last: bounds._max.period };
  }

  findOwned(userId: bigint, id: bigint): Promise<FullTransaction | null> {
    return this.db.forUser(userId, (tx) =>
      tx.transaction.findFirst({ where: { id, userId }, include: INCLUDE_ALL }),
    );
  }

  /**
   * Everything in a single database transaction: if something fails halfway,
   * no orphan transaction is left without its splits.
   *
   * A clash on the unique `external_ref` becomes a DuplicateError: a client
   * retrying the same capture is told "it is already there".
   */
  async createWithDetails(
    data: Prisma.TransactionUncheckedCreateInput & { userId: bigint },
    splits: readonly SplitToWrite[],
    tagIds: readonly bigint[],
  ): Promise<FullTransaction> {
    try {
      return await this.db.forUser(data.userId, async (tx) => {
        const transaction = await tx.transaction.create({ data });
        await writeDetails(tx, transaction.id, splits, tagIds);
        return tx.transaction.findUniqueOrThrow({
          where: { id: transaction.id },
          include: INCLUDE_ALL,
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new DuplicateError();
      }
      throw error;
    }
  }

  /** Both legs in the same database transaction, returned in order (`in`, `out`). */
  createTransfer(
    base: Omit<Prisma.TransactionUncheckedCreateInput, 'accountId' | 'transferDir'> & {
      userId: bigint;
      transferGroupId: string;
    },
    fromAccountId: bigint,
    toAccountId: bigint,
  ): Promise<FullTransaction[]> {
    return this.db.forUser(base.userId, async (tx) => {
      await tx.transaction.create({
        data: { ...base, accountId: fromAccountId, transferDir: 'out' },
      });
      await tx.transaction.create({ data: { ...base, accountId: toAccountId, transferDir: 'in' } });

      return tx.transaction.findMany({
        where: { userId: base.userId, transferGroupId: base.transferGroupId },
        include: INCLUDE_ALL,
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
  ): Promise<FullTransaction> {
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

      return tx.transaction.findUniqueOrThrow({ where: { id }, include: INCLUDE_ALL });
    });
  }

  /** The account of the OTHER leg of a transfer, or null when it has none. */
  async partnerAccount(
    userId: bigint,
    transferGroupId: string,
    id: bigint,
  ): Promise<bigint | null> {
    const otherLeg = await this.db.forUser(userId, (tx) =>
      tx.transaction.findFirst({
        where: { userId, transferGroupId, id: { not: id } },
        select: { accountId: true },
      }),
    );
    return otherLeg?.accountId ?? null;
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
    query: TransactionFilters,
  ): Promise<Prisma.TransactionWhereInput> {
    const where: Prisma.TransactionWhereInput = { userId, ...plainFilters(query) };

    const requested = [
      ...(query.categoryId !== undefined ? [BigInt(query.categoryId)] : []),
      ...categoryIds(query.categoryIds),
    ];
    // Filtering by "Costos fijos" has to bring EVERYTHING below it: the
    // transactions hang from the concept, which is the leaf.
    if (requested.length > 0) {
      where.categoryId = { in: branchesOf(await categoryNodes(tx, userId), requested) };
    }

    if (query.q) {
      // The search also goes through the CLASSIFICATION: typing "servicios
      // públicos" has to bring everything that hangs from that category, even
      // if no row says so in its description. Whoever searches thinks of the
      // name they sorted their money with, not of how the charge was written.
      const byCategoryName = await branchByName(tx, userId, query.q);

      // `mode: 'insensitive'` is NOT optional. Postgres compares case-sensitively
      // —MariaDB did not—, so searching "celsia" would not find
      // "Celsia (Energia)". People search in lowercase.
      where.OR = [
        { description: { contains: query.q, mode: 'insensitive' } },
        { merchant: { contains: query.q, mode: 'insensitive' } },
        { notes: { contains: query.q, mode: 'insensitive' } },
        ...(byCategoryName.length > 0 ? [{ categoryId: { in: byCategoryName } }] : []),
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
 * The categories whose NAME contains the text, with their whole branch.
 *
 * With the branch, not only the matching ones: transactions hang from the
 * concept, so searching a category's name without expanding it would return
 * no row at all.
 */
async function branchByName(tx: UserTx, userId: bigint, text: string): Promise<bigint[]> {
  const nodes = await categoryNodes(tx, userId);
  const needle = text.toLowerCase();
  const matches = nodes.filter((c) => c.name.toLowerCase().includes(needle)).map((c) => c.id);
  return matches.length === 0 ? [] : branchesOf(nodes, matches);
}

/** The filters that need no lookup: period, account, type, status, tag, amount. */
function plainFilters(query: TransactionFilters): Prisma.TransactionWhereInput {
  return {
    // By PERIOD: the range the person picks at the top refers to the month the
    // expense belongs to, not to the day the money left. Filtering by `date`,
    // March would show empty when its bills were paid in April — which is
    // exactly what used to happen.
    ...((query.from || query.to) && {
      period: {
        ...(query.from && { gte: new Date(query.from) }),
        ...(query.to && { lte: new Date(query.to) }),
      },
    }),
    ...(query.accountId !== undefined && { accountId: BigInt(query.accountId) }),
    ...(query.type && { type: query.type }),
    ...(query.status && { status: query.status }),
    ...(query.tagId !== undefined && { tags: { some: { tagId: BigInt(query.tagId) } } }),
    ...((query.minAmount || query.maxAmount) && {
      amount: {
        ...(query.minAmount && { gte: toMoney(query.minAmount) }),
        ...(query.maxAmount && { lte: toMoney(query.maxAmount) }),
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
