import { Injectable } from '@nestjs/common';

import type { RecurrencePause } from './recurrence.domain';
import type { PausePeriod } from '../../common/recurrence/recurrence';
import type { RecurrencePause as PauseRow } from '../../generated/prisma/client';
import { Database, type UserTx } from '../../prisma/database';

/** `2026-10` → the date of its first day, which is how the table stores a month. */
const dateOf = (month: string): Date => new Date(`${month}-01T00:00:00Z`);
const monthOf = (date: Date): string => date.toISOString().slice(0, 7);

function pauseFromRow(row: PauseRow): RecurrencePause {
  return {
    id: row.id,
    categoryId: row.categoryId,
    fromMonth: monthOf(row.fromMonth),
    resumeMonth: row.resumeMonth === null ? null : monthOf(row.resumeMonth),
  };
}

/**
 * What a write checks against the concept's OTHER periods before it lands. It
 * throws to refuse, and the whole unit of work rolls back.
 */
export type PeriodCheck = (others: PausePeriod[]) => void;

/** The periods in which a recurring concept does not renew (ADR 0036). */
@Injectable()
export class RecurrencePausesRepository {
  constructor(private readonly db: Database) {}

  /** The concept's history, the most recent first. */
  async listForConcept(userId: bigint, categoryId: bigint): Promise<RecurrencePause[]> {
    const rows = await this.db.forUser(userId, (tx) =>
      tx.recurrencePause.findMany({
        where: { userId, categoryId },
        orderBy: { fromMonth: 'desc' },
      }),
    );
    return rows.map(pauseFromRow);
  }

  async findOne(userId: bigint, categoryId: bigint, id: bigint): Promise<RecurrencePause | null> {
    const row = await this.db.forUser(userId, (tx) =>
      tx.recurrencePause.findFirst({ where: { id, userId, categoryId } }),
    );
    return row === null ? null : pauseFromRow(row);
  }

  /** The periods of several concepts, by concept id. */
  async forConcepts(
    userId: bigint,
    categoryIds: readonly bigint[],
  ): Promise<Map<string, PausePeriod[]>> {
    const byConcept = new Map<string, PausePeriod[]>();
    if (categoryIds.length === 0) return byConcept;

    const rows = await this.db.forUser(userId, (tx) =>
      tx.recurrencePause.findMany({ where: { userId, categoryId: { in: [...categoryIds] } } }),
    );
    for (const row of rows) {
      const key = row.categoryId.toString();
      const { fromMonth, resumeMonth } = pauseFromRow(row);
      byConcept.set(key, [...(byConcept.get(key) ?? []), { fromMonth, resumeMonth }]);
    }
    return byConcept;
  }

  /** One unit of work: lock the concept's periods, check, write. */
  createChecked(
    userId: bigint,
    categoryId: bigint,
    period: PausePeriod,
    check: PeriodCheck,
  ): Promise<RecurrencePause> {
    return this.db.forUser(userId, async (tx) => {
      check(await this.lockedPeriods(tx, userId, categoryId));
      const row = await tx.recurrencePause.create({
        data: {
          userId,
          categoryId,
          fromMonth: dateOf(period.fromMonth),
          resumeMonth: period.resumeMonth === null ? null : dateOf(period.resumeMonth),
        },
      });
      return pauseFromRow(row);
    });
  }

  /** One unit of work: lock, check against the others, set the resume month. */
  updateChecked(
    userId: bigint,
    categoryId: bigint,
    id: bigint,
    resumeMonth: string,
    check: PeriodCheck,
  ): Promise<RecurrencePause> {
    return this.db.forUser(userId, async (tx) => {
      check(await this.lockedPeriods(tx, userId, categoryId, id));
      const row = await tx.recurrencePause.update({
        where: { id, userId, categoryId },
        data: { resumeMonth: dateOf(resumeMonth) },
      });
      return pauseFromRow(row);
    });
  }

  /** `false` when there was nothing to delete. */
  async remove(userId: bigint, categoryId: bigint, id: bigint): Promise<boolean> {
    const { count } = await this.db.forUser(userId, (tx) =>
      tx.recurrencePause.deleteMany({ where: { id, userId, categoryId } }),
    );
    return count > 0;
  }

  /**
   * The concept's periods, read after taking a lock on them.
   *
   * Two requests pausing the same concept at once would both read «no
   * overlap» and both write. The lock is an advisory one, held until the
   * transaction ends, and keyed by the concept: it queues writers of the same
   * concept and nobody else. (An exclusion constraint would need the
   * `btree_gist` extension; ADR 0036.)
   */
  private async lockedPeriods(
    tx: UserTx,
    userId: bigint,
    categoryId: bigint,
    except?: bigint,
  ): Promise<PausePeriod[]> {
    const key = `recurrence_pauses:${categoryId.toString()}`;
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${key}::text, 0))`;
    const rows = await tx.recurrencePause.findMany({
      where: { userId, categoryId, ...(except !== undefined && { id: { not: except } }) },
    });
    return rows.map((row) => {
      const { fromMonth, resumeMonth } = pauseFromRow(row);
      return { fromMonth, resumeMonth };
    });
  }
}
