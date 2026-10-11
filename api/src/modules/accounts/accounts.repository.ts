import { Injectable } from '@nestjs/common';

import type { BalanceMovement } from '../../common/money/balance';
import { toMoney } from '../../common/money/money';
import type { Account, Prisma } from '../../generated/prisma/client';
import { Database } from '../../prisma/database';

@Injectable()
export class AccountsRepository {
  constructor(private readonly db: Database) {}

  /**
   * Every query filters by `userId`. It is not a style convention: without
   * that filter, changing an id in the URL would read another user's data
   * (IDOR).
   */
  async list(userId: bigint, shouldIncludeArchived: boolean): Promise<Account[]> {
    return this.db.forUser(userId, (tx) =>
      tx.account.findMany({
        where: { userId, ...(shouldIncludeArchived ? {} : { isArchived: false }) },
        orderBy: [{ isArchived: 'asc' }, { name: 'asc' }],
      }),
    );
  }

  async findById(userId: bigint, id: bigint): Promise<Account | null> {
    return this.db.forUser(userId, (tx) => tx.account.findFirst({ where: { id, userId } }));
  }

  async create(userId: bigint, data: Prisma.AccountUncheckedCreateInput): Promise<Account> {
    // The userId comes from the token, never from the payload.
    return this.db.forUser(userId, (tx) => tx.account.create({ data: { ...data, userId } }));
  }

  /**
   * `updateMany` with userId in the where, not a bare `update` by id: if the
   * row belongs to another user the count stays at 0 and we can answer 404
   * without having touched it or confirmed it exists.
   */
  async update(userId: bigint, id: bigint, data: Prisma.AccountUpdateInput): Promise<number> {
    const { count } = await this.db.forUser(userId, (tx) =>
      tx.account.updateMany({ where: { id, userId }, data }),
    );
    return count;
  }

  async delete(userId: bigint, id: bigint): Promise<number> {
    const { count } = await this.db.forUser(userId, (tx) =>
      tx.account.deleteMany({ where: { id, userId } }),
    );
    return count;
  }

  async countTransactions(userId: bigint, accountId: bigint): Promise<number> {
    return this.db.forUser(userId, (tx) => tx.transaction.count({ where: { userId, accountId } }));
  }

  /**
   * Aggregates the transactions of ALL the user's accounts in a single query,
   * grouped by (account, type, direction, status).
   *
   * It groups instead of fetching the rows one by one because a transaction's
   * effect on the balance is linear in the amount: adding first and applying
   * the sign afterwards gives exactly the same result as walking every row,
   * and avoids pulling years of history into memory just to list accounts.
   */
  async balanceMovements(userId: bigint): Promise<Map<string, BalanceMovement[]>> {
    const groups = await this.db.forUser(userId, (tx) =>
      tx.transaction.groupBy({
        by: ['accountId', 'type', 'transferDir', 'status'],
        where: {
          userId,
          // A transaction without an account takes part in no balance, and it
          // is dropped here instead of further down so rows that would be
          // ignored are not fetched. Balances stay exact for the accounts that
          // exist; there is simply no balance for what belongs to none.
          accountId: { not: null },
        },
        _sum: { amount: true },
      }),
    );

    const byAccount = new Map<string, BalanceMovement[]>();

    for (const group of groups) {
      // The where filter already guarantees it; TypeScript cannot know.
      if (group.accountId === null) continue;
      const key = group.accountId.toString();
      const movements = byAccount.get(key) ?? [];

      movements.push({
        type: group.type,
        transferDir: group.transferDir,
        amount: toMoney(group._sum.amount ?? 0),
        status: group.status,
      });

      byAccount.set(key, movements);
    }

    return byAccount;
  }
}
