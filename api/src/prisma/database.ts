import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

import { PrismaService } from './prisma.service';
import type { Prisma } from '../generated/prisma/client';

/** The client a unit of work gets: every query on it runs as that user. */
export type UserTx = Prisma.TransactionClient;

interface OpenUnit {
  userId: bigint;
  tx: UserTx;
}

/**
 * Generous on purpose: the pool is small (5–10 connections through the
 * pooler) and a unit of work used to be a single query with no wait at all.
 */
const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 15_000 } as const;

/**
 * The only way a repository reaches a user's rows (ADR 0019).
 *
 * `forUser` opens a transaction and, as its FIRST statement, sets
 * `app.current_user_id` with `set_config(..., true)`: transaction-local, so
 * it travels on the same connection as the queries and is gone at COMMIT. In
 * the pooler's transaction mode (6543) that is the only safe form —two loose
 * statements can land on different connections— and it is just as correct on
 * the session port.
 *
 * The row-level security policies read that setting. A query that forgets
 * its `user_id` filter still only sees the rows of the user the unit runs
 * as; a query outside any unit sees none.
 *
 * Nested calls for the SAME user reuse the open transaction instead of
 * opening another, so a repository method can call another one, and a
 * service can group several calls into one unit to save the round trips.
 * Nesting a DIFFERENT user is a bug and throws.
 *
 * `database.rule.spec.ts` fails if a repository injects `PrismaService`
 * instead of this, outside its listed exceptions.
 */
@Injectable()
export class Database {
  private readonly open = new AsyncLocalStorage<OpenUnit>();

  constructor(private readonly prisma: PrismaService) {}

  forUser<T>(userId: bigint, work: (tx: UserTx) => Promise<T>): Promise<T> {
    const current = this.open.getStore();
    if (current) {
      if (current.userId !== userId) {
        return Promise.reject(new Error('A unit of work cannot switch users'));
      }
      return work(current.tx);
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_user_id', ${userId.toString()}, true)`;
      return this.open.run({ userId, tx }, () => work(tx));
    }, TRANSACTION_OPTIONS);
  }
}
