import { Injectable } from '@nestjs/common';

import { RecurrencePausesRepository } from './recurrence-pauses.repository';
import type { DiscardedCharges, PausedCharge, RecurrencePause } from './recurrence.domain';
import { NotFoundError, ConflictError, ValidationError } from '../../common/errors/domain-error';
import {
  chargeFingerprintPrefix,
  isPausedIn,
  monthOfFingerprint,
  periodsOverlap,
  type PausePeriod,
} from '../../common/recurrence/recurrence';
import { CategoriesService } from '../categories/categories.service';
import { LedgerService } from '../transactions/ledger.service';
import { TransactionsService } from '../transactions/transactions.service';

export type { DiscardedCharges, PausedCharge, RecurrencePause } from './recurrence.domain';

/** Refuses a period that shares a month with one the concept already has. */
function refuseOverlap(period: PausePeriod): (others: PausePeriod[]) => void {
  return (others) => {
    if (others.some((other) => periodsOverlap(period, other))) {
      throw new ConflictError(
        'Ese periodo se cruza con otra pausa de este concepto: una pausa no puede empezar dentro de otra.',
        { code: 'pause_overlaps' },
      );
    }
  };
}

/**
 * Pausing the renewal of a recurring concept (ADR 0036).
 *
 * A pause is a period of months in which the concept does nothing recurring:
 * no automatic charge, not pending, not in the month's budget. What it does
 * NOT do is touch a movement: the charges already written in months that
 * become paused are listed (`chargesInPause`) and deleted only when the
 * person confirms (`discardCharges`).
 */
@Injectable()
export class RecurrenceService {
  constructor(
    private readonly pauses: RecurrencePausesRepository,
    private readonly categories: CategoriesService,
    private readonly ledger: LedgerService,
    private readonly transactions: TransactionsService,
  ) {}

  async list(userId: bigint, conceptId: bigint): Promise<RecurrencePause[]> {
    await this.categories.get(userId, conceptId);
    return this.pauses.listForConcept(userId, conceptId);
  }

  /** Pauses from `fromMonth` on, with no end yet. */
  async pause(userId: bigint, conceptId: bigint, fromMonth: string): Promise<RecurrencePause> {
    const concept = await this.categories.get(userId, conceptId);
    if (!concept.isRecurring) {
      throw new ValidationError('Solo se pausa la renovación de un concepto recurrente.', {
        code: 'pause_requires_recurring',
      });
    }

    const period = { fromMonth, resumeMonth: null };
    return this.pauses.createChecked(userId, conceptId, period, refuseOverlap(period));
  }

  /** Sets the month the concept is active again: due that month and on. */
  async resume(
    userId: bigint,
    conceptId: bigint,
    pauseId: bigint,
    resumeMonth: string,
  ): Promise<RecurrencePause> {
    const pause = await this.requirePause(userId, conceptId, pauseId);
    if (resumeMonth <= pause.fromMonth) {
      throw new ValidationError(
        'El mes en que se reactiva tiene que ser posterior al mes en que quedó en pausa.',
        { code: 'pause_resume_not_after_start' },
      );
    }

    const period = { fromMonth: pause.fromMonth, resumeMonth };
    return this.pauses.updateChecked(
      userId,
      conceptId,
      pauseId,
      resumeMonth,
      refuseOverlap(period),
    );
  }

  /** Removes a period, as if it had never been scheduled. Movements stay as they are. */
  async remove(userId: bigint, conceptId: bigint, pauseId: bigint): Promise<void> {
    await this.categories.get(userId, conceptId);
    if (!(await this.pauses.remove(userId, conceptId, pauseId))) throw pauseNotFound();
  }

  /**
   * The automatic charges of the concept in months the pause covers.
   *
   * Only what the auto-charge task wrote —its fingerprint `auto:<id>:<month>`—
   * and still classified under the concept. A movement recorded by hand is
   * never a candidate: it is something someone said happened.
   */
  async chargesInPause(
    userId: bigint,
    conceptId: bigint,
    pauseId: bigint,
  ): Promise<PausedCharge[]> {
    const concept = await this.categories.get(userId, conceptId);
    const pause = await this.requirePause(userId, conceptId, pauseId);
    const charges = await this.ledger.findAutoCharges(
      userId,
      conceptId,
      chargeFingerprintPrefix(conceptId),
    );

    return charges.flatMap((charge) => {
      const month = monthOfFingerprint(charge.externalRef);
      if (!isPausedIn([pause], month)) return [];
      const date = charge.date.toISOString().slice(0, 10);
      return [{ id: charge.id, month, date, conceptName: concept.name }];
    });
  }

  /**
   * Deletes the charges the person confirmed. Every id must be in
   * `chargesInPause`: this is not a way to delete any movement.
   */
  async discardCharges(
    userId: bigint,
    conceptId: bigint,
    pauseId: bigint,
    transactionIds: readonly bigint[],
  ): Promise<DiscardedCharges> {
    const candidates = await this.chargesInPause(userId, conceptId, pauseId);
    const allowed = new Set(candidates.map((charge) => charge.id.toString()));
    const requested = [...new Set(transactionIds.map((id) => id.toString()))];

    if (requested.some((id) => !allowed.has(id))) {
      throw new ValidationError(
        'Solo se eliminan los cobros automáticos de este concepto en los meses de la pausa.',
        { code: 'charge_not_in_pause' },
      );
    }

    for (const id of requested) await this.transactions.remove(userId, BigInt(id));
    return { deleted: requested.length };
  }

  /** The paused periods of several concepts, by concept id: what the dashboard needs. */
  periodsOf(userId: bigint, conceptIds: readonly bigint[]): Promise<Map<string, PausePeriod[]>> {
    return this.pauses.forConcepts(userId, conceptIds);
  }

  private async requirePause(
    userId: bigint,
    conceptId: bigint,
    pauseId: bigint,
  ): Promise<RecurrencePause> {
    await this.categories.get(userId, conceptId);
    const pause = await this.pauses.findOne(userId, conceptId, pauseId);
    if (pause === null) throw pauseNotFound();
    return pause;
  }
}

function pauseNotFound(): NotFoundError {
  return new NotFoundError('La pausa no existe.');
}
