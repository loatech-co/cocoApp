import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { PagosAutomaticosService } from './pagos-automaticos';

/** Bogotá is UTC−5 all year (no daylight saving). */
const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Minutes past midnight in Bogotá when the daily run fires. */
const DAILY_RUN_MINUTE = 5;

/** Today in Bogotá as `YYYY-MM-DD`. */
export function todayInBogota(now: Date): string {
  return new Date(now.getTime() - BOGOTA_OFFSET_MS).toISOString().slice(0, 10);
}

/** Milliseconds from `now` until the next 00:05 in Bogotá. */
export function msUntilNextDailyRun(now: Date): number {
  const bogota = new Date(now.getTime() - BOGOTA_OFFSET_MS);
  const next = Date.UTC(
    bogota.getUTCFullYear(),
    bogota.getUTCMonth(),
    bogota.getUTCDate(),
    0,
    DAILY_RUN_MINUTE,
  );
  const nextRun = next > bogota.getTime() ? next : next + DAY_MS;
  return nextRun - bogota.getTime();
}

/**
 * Charges the auto-paid concepts of every user, once a day and at start-up.
 *
 * ── Why it left GET /dashboard (phase 6.7) ──────────────────────────────────
 * It used to run at the top of the dashboard request: a GET that wrote
 * movements. Reads that write are surprising —a prefetch, a retry or a
 * crawler creates money— and nothing got charged for whoever didn't open the
 * app that month. The API is a single long-lived Node process, so the clock
 * can live inside it: no hosting cron, no panel, no extra dependency.
 *
 * ── Why at start-up too ─────────────────────────────────────────────────────
 * Every deploy restarts the process. Without a run at boot, a deploy at 00:04
 * would skip that day's 00:05 run until the next one, 24 h later.
 *
 * ── Why running twice is harmless ───────────────────────────────────────────
 * `cobrarLoQueToque` only charges the CURRENT month, skips a concept already
 * paid this month, and every movement it writes carries a deterministic
 * `external_ref` that is UNIQUE per user. Two runs —boot and the daily one
 * landing together, or two processes during a deploy— create each movement
 * once. An in-process flag also keeps one run from overlapping another.
 *
 * Disabled under NODE_ENV=test unless AUTO_CHARGE=on: the e2e suites boot the
 * whole app and empty the tables between tests, and a run writing in the
 * background would race with that. Tests call `runOnce()` themselves.
 */
@Injectable()
export class AutoChargeTask implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(AutoChargeTask.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly autoPayments: PagosAutomaticosService,
  ) {}

  onApplicationBootstrap(): void {
    if (process.env.NODE_ENV === 'test' && process.env.AUTO_CHARGE !== 'on') return;

    // Not awaited: start-up must not wait on a database sweep.
    void this.runOnce();
    this.scheduleNext();
  }

  onModuleDestroy(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** One sweep over every user with an auto-paid concept. Returns how many movements it created. */
  async runOnce(now: Date = new Date()): Promise<number> {
    if (this.running) return 0;
    this.running = true;

    try {
      const today = todayInBogota(now);
      const currentMonth = `${today.slice(0, 7)}-01`;
      const owners = await this.prisma.category.findMany({
        where: { recurrente: true, pagoAutomatico: true, isArchived: false },
        select: { userId: true },
        distinct: ['userId'],
      });

      let created = 0;
      for (const { userId } of owners) {
        // One user's failure must not stop the others; the service already
        // logs per concept, this catches anything above that.
        try {
          created += await this.autoPayments.cobrarLoQueToque(userId, currentMonth, today);
        } catch (error) {
          this.logger.error(
            `Auto-charge failed for user ${String(userId)}: ${(error as Error).message}`,
          );
        }
      }

      this.logger.log(
        `Auto-charge run for ${today}: ${owners.length} user(s), ${created} movement(s) created`,
      );
      return created;
    } finally {
      this.running = false;
    }
  }

  private scheduleNext(): void {
    this.timer = setTimeout(() => {
      void this.runOnce().finally(() => this.scheduleNext());
    }, msUntilNextDailyRun(new Date()));
    // The timer must not keep the process alive on shutdown.
    this.timer.unref();
  }
}
