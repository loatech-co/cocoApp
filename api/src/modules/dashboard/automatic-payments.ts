import { Injectable, Logger } from '@nestjs/common';

import {
  expectedForMonth,
  chargeFingerprint,
  isAutoChargeDue,
  isDueInMonth,
  dueDate,
  historyWindow,
} from './pending';
import { toMoney } from '../../common/money/money';
import { CategoryLookupService, type AutoPaidConcept } from '../categories/category-lookup.service';
import { LedgerService, type MonthlyHistory } from '../transactions/ledger.service';

/**
 * The concepts that charge themselves.
 *
 * ── What it does ────────────────────────────────────────────────────────────
 * A recurring concept with automatic payment does not wait for anyone to
 * record it: when its payment day comes, the movement is created here and
 * with that it stops showing in pending payments. It is for what gets charged
 * without anyone doing anything —a debit, a subscription, a direct-debit
 * instalment—, where going to mark it every month is clerk's work for money
 * that already left.
 *
 * ── When it runs ────────────────────────────────────────────────────────────
 * From AutoChargeTask (`auto-charge.task.ts`): once a day at 00:05 Bogotá and
 * at every start-up. Until phase 6.7 it ran at the top of GET /dashboard,
 * which made a read write movements and charged nothing for whoever did not
 * open the app that month.
 *
 * ── And why only the CURRENT month ──────────────────────────────────────────
 * It never backfills past months. An old month without a movement is a
 * fact —it was not paid, or not recorded— and making it up backwards would
 * change figures someone already accepted: an average, a year total, a
 * decision.
 *
 * From that follows, without storing any date, that turning the switch on
 * means «from this month on».
 */
@Injectable()
export class AutomaticPaymentsService {
  private readonly logger = new Logger(AutomaticPaymentsService.name);

  constructor(
    private readonly categories: CategoryLookupService,
    private readonly ledger: LedgerService,
  ) {}

  /**
   * Charges whatever is due and returns how many movements it created.
   *
   * `currentMonth` arrives as `YYYY-MM-01` and `today` as `YYYY-MM-DD`, both
   * already in the user's time zone: deciding what day today is is not this
   * method's business.
   */
  async chargeDue(userId: bigint, currentMonth: string, today: string): Promise<number> {
    const concepts = await this.categories.findAutoPaid(userId);

    // Whoever does not use the feature pays not one query more. That is the
    // case for almost everyone almost always, and this runs for EVERY owner
    // on every sweep.
    if (concepts.length === 0) return 0;

    const dueThisMonth = concepts.filter(
      (c) => c.periodicity !== null && isDueInMonth(c.periodicity, c.paymentMonth, currentMonth),
    );
    if (dueThisMonth.length === 0) return 0;

    const ids = dueThisMonth.map((c) => c.id);

    /*
      What is already recorded this month, in ANY status.

      There is no `cleared` filter here, on purpose —the pending list does
      filter—. There the question is «is this settled?», and an uncleared
      movement settles nothing. Here it is «is something already written?»,
      and there is: charging on top would leave the same expense twice, one
      of them made up by us.
    */
    const recorded = await this.ledger.categoriesWithMovementIn(
      userId,
      ids,
      new Date(currentMonth),
    );

    const toCharge = dueThisMonth.filter((c) => !recorded.has(c.id.toString()));
    if (toCharge.length === 0) return 0;

    // The history, only of those left and only from BEFORE this month: that
    // is where the figure comes from when the concept has no budget set.
    const history = await this.ledger.monthlyHistory(
      userId,
      toCharge.map((c) => c.id),
      historyWindow(currentMonth),
    );

    let created = 0;

    for (const concept of toCharge) {
      if (await this.chargeOne(userId, concept, history, currentMonth, today)) created += 1;
    }

    return created;
  }

  /** Charges one concept if its day came. `true` when it wrote the movement. */
  private async chargeOne(
    userId: bigint,
    concept: AutoPaidConcept,
    history: MonthlyHistory,
    currentMonth: string,
    today: string,
  ): Promise<boolean> {
    const due = dueDate(currentMonth, concept.paymentDay);
    const expected = expectedForMonth(
      concept.budget === null ? null : toMoney(concept.budget),
      history.get(concept.id.toString()) ?? new Map(),
      currentMonth.slice(0, 7),
    );

    if (
      // `isAutoChargeDue` already says no without an expected amount; it is
      // checked here too so that `expected` arrives non-null.
      expected === null ||
      !isAutoChargeDue({
        isAutoPaid: true,
        dueDateIso: due,
        todayIso: today,
        expected,
      })
    )
      return false;

    try {
      return await this.ledger.createAutoCharge({
        userId,
        categoryId: concept.id,
        date: new Date(due),
        period: new Date(currentMonth),
        amount: expected.toFixed(2),
        // The concept's name, like any movement of its own: the one on the
        // card comes from the classification, not from this, but the table
        // and searches read `description`.
        description: concept.name,
        /*
          It says the app put it there, and with which figure.

          The value can be an ESTIMATE —the average of the previous months,
          when the concept has no budget— and that cannot be
          indistinguishable from a figure someone read on a bill. Whoever
          opens the movement has to be able to fix it knowing it is needed.
        */
        notes:
          concept.budget === null
            ? 'Cobrado automáticamente. El valor es un estimado del promedio de los meses anteriores: corrígelo cuando tengas el recibo.'
            : 'Cobrado automáticamente, por el presupuesto del concepto.',
        externalRef: chargeFingerprint(concept.id, currentMonth),
      });
    } catch (error) {
      /*
        A clash with the unique fingerprint does not reach here: it is two
        simultaneous runs wanting to charge the same thing, and the database
        stopping the duplicate. `createAutoCharge` returns it as `false`: the
        first one wins and the second goes on its way.

        Any other error is logged and does not bring down the run either: one
        failed concept must not stop the rest of the user's charges.
      */
      this.logger.error(
        `No se pudo cobrar “${concept.name}” (${concept.id}): ${(error as Error).message}`,
      );
      return false;
    }
  }
}
