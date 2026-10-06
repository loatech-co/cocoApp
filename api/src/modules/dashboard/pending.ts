import { ZERO, type Money } from '../../common/money/money';
import type { Periodicity } from '../../generated/prisma/client';

/** How many months each periodicity takes to come back. */
const MONTHS_BETWEEN_PAYMENTS: Record<Periodicity, number> = {
  monthly: 1,
  bimonthly: 2,
  quarterly: 3,
  semiannual: 6,
  annual: 12,
};

/** `2026-09-01` → 24320. Absolute months, to subtract without fighting over years. */
export function absoluteMonth(iso: string): number {
  // `= NaN` is what a missing part would give: the same result as before.
  const [year = NaN, month = NaN] = iso.split('-').map(Number);
  return year * 12 + (month - 1);
}

/**
 * Whether a recurring concept is due in a given month.
 *
 * ── Why a reference month is needed ─────────────────────────────────────────
 * Because "every three months" does not say WHICH ones. It can be January,
 * April, July and October, or February, May, August and November: they are
 * different cycles and what tells them apart is the month one of them falls in.
 *
 * It used to count from the last payment, which seemed to save the field but
 * made everything fragile: deleting or fixing an old movement shifted the
 * whole cycle forwards or backwards, and the concept became due in another
 * month without anyone touching its settings.
 *
 * Monthly needs no reference: it is due every month.
 */
export function isDueInMonth(
  periodicity: Periodicity,
  referenceMonth: number | null,
  month: string,
): boolean {
  if (periodicity === 'monthly') return true;

  const step = MONTHS_BETWEEN_PAYMENTS[periodicity];

  // Without a reference it is assumed due: it is a concept marked recurring
  // with no record this month. Keeping quiet would hide exactly what the user
  // wants to see.
  if (referenceMonth === null) return true;

  const distance = absoluteMonth(month) - (referenceMonth - 1);
  return ((distance % step) + step) % step === 0;
}

/**
 * The day of the month it is due, clipped to the short months.
 *
 * Whoever pays on the 31st does not stop paying in February: they pay on the
 * 28th. Without this clip the due date would land on a day that does not
 * exist and the date would overflow into the next month, which is worse than
 * rounding.
 */
export function dueDate(month: string, paymentDay: number | null): string {
  const [year = NaN, monthNumber = NaN] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const day = Math.min(paymentDay ?? lastDay, lastDay);

  return `${month.slice(0, 7)}-${String(day).padStart(2, '0')}`;
}

/** The `count` months before `month`, from the most recent to the oldest. */
export function previousMonths(month: string, count = 3): string[] {
  const [year = NaN, m = NaN] = month.split('-').map(Number);
  return Array.from({ length: count }, (_, i) =>
    new Date(Date.UTC(year, m - 1 - (i + 1), 1)).toISOString().slice(0, 7),
  );
}

/**
 * How much a recurring concept is expected to cost.
 *
 * ── The average of the three previous months ────────────────────────────────
 * Not what it cost last time: a power bill from a holiday month, or one with a
 * one-off top-up, became the forecast for every following month. Three months
 * average out the noise without reaching so far back that they drag in old
 * prices.
 *
 * ── Months WITHOUT a payment do not count as zero ───────────────────────────
 * A concept paid in two of the three months costs what it cost those two
 * times, not two thirds of that. Counting the empty month as a zero would
 * cheapen the forecast of exactly what is paid irregularly, which is what
 * surprises the most.
 *
 * ── And if there is nothing in the three months ─────────────────────────────
 * It falls back to the last month that did have a payment. Not a rare case:
 * an ANNUAL concept almost never has payments in the three previous months,
 * and leaving it without a figure would be worse than estimating it with the
 * only one there is.
 *
 * `byMonth` holds what each month cost —a month with two payments brings the
 * sum—, and `month` is the month being estimated, as `YYYY-MM`.
 */
export function estimateForMonth(
  byMonth: ReadonlyMap<string, Money>,
  month: string,
  count = 3,
): Money | null {
  const recent = previousMonths(month, count)
    .map((m) => byMonth.get(m))
    .filter((v): v is Money => v !== undefined);

  if (recent.length > 0) {
    return recent.reduce<Money>((total, v) => total.plus(v), ZERO).dividedBy(recent.length);
  }

  const lastPaid = [...byMonth.keys()]
    .filter((m) => m < month)
    .sort()
    .pop();
  return lastPaid === undefined ? null : (byMonth.get(lastPaid) ?? null);
}

/**
 * Which part of the history `estimateForMonth` reads to estimate
 * `currentMonth` (`YYYY-MM-01`): from the first day of the oldest of its
 * `count` previous months up to the current month, not included. What lies
 * further back only matters as the last month with a payment, and the
 * repository resolves that.
 */
export function historyWindow(currentMonth: string, count = 3): { before: Date; since: Date } {
  const oldest = previousMonths(currentMonth.slice(0, 7), count).at(-1) ?? currentMonth;
  return { before: new Date(currentMonth), since: new Date(`${oldest.slice(0, 7)}-01`) };
}

/**
 * How much it is expected to cost, looking first at what was STATED.
 *
 * ── The concept's budget rules ──────────────────────────────────────────────
 * Some expenses have a value that is known, not estimated: a rent with a
 * contract, a school fee, a fixed instalment. For those, averaging the three
 * previous months gives a worse figure than the stated one —the month paid
 * with a surcharge drags it up, the one paid by half drags it down— and on
 * top of that it changes by itself from one month to the next without anyone
 * touching anything.
 *
 * When set, it is used as is, every month. That is what having one means: if
 * it were mixed with the average, it would no longer be the budget but an
 * influence.
 *
 * ── Empty is still averaged ─────────────────────────────────────────────────
 * Which is right for what really varies: power, groceries, fuel. There the
 * best figure available is what it cost lately.
 *
 * ── And a ZERO budget is a budget ───────────────────────────────────────────
 * Not a gap. Someone who writes 0 is saying «this costs nothing this year»,
 * and falling back to the average would give back exactly the figure they
 * meant to remove. That is why it is checked against `null` and not for
 * falsiness.
 */
export function expectedForMonth(
  budget: Money | null,
  byMonth: ReadonlyMap<string, Money>,
  month: string,
  count = 3,
): Money | null {
  return budget ?? estimateForMonth(byMonth, month, count);
}

/**
 * The fingerprint of an automatic charge: one concept, one month, once.
 *
 * It goes in `external_ref`, which has a UNIQUE index per user. The charge is
 * checked before inserting, but two simultaneous runs —two processes during a
 * deploy— can pass the check at the same time and both reach the insert. With
 * the fingerprint, the second one hits the database instead of duplicating an
 * expense.
 */
export function chargeFingerprint(categoryId: bigint, month: string): string {
  return `auto:${categoryId.toString()}:${month.slice(0, 7)}`;
}

/**
 * Should this be charged by itself, today?
 *
 * ── Three conditions, and all three must hold ───────────────────────────────
 * 1. The concept asks for it. Without `isAutoPaid` nothing charges itself:
 *    whoever does not turn it on wants to keep recording by hand, and getting
 *    ahead of them would be writing movements they did not ask for.
 * 2. It is already DUE. A debit on the 20th has not gone out on the 3rd, and
 *    recording it earlier says the money is gone when it is still there.
 * 3. There is a figure. Without a budget and without history there is no
 *    number to put, and a zero automatic charge would be a lie written into
 *    the books. That stays pending, which is the honest answer: there is
 *    something to pay and we do not know how much.
 *
 * What is NOT checked here is whether it is already paid: the caller, who has
 * the month's movements in front of it, knows that, and its job is not to call
 * twice.
 */
export function isAutoChargeDue({
  isAutoPaid,
  dueDateIso,
  todayIso,
  expected,
}: {
  isAutoPaid: boolean;
  dueDateIso: string;
  todayIso: string;
  expected: Money | null;
}): boolean {
  if (!isAutoPaid) return false;
  if (expected === null) return false;
  return dueDateIso <= todayIso;
}

/**
 * Where a recurring concept stands in the current month: whether it is still
 * due, and how much it adds to the month's budget.
 *
 * ── The bug it fixes ────────────────────────────────────────────────────────
 * Until now ONE cleared movement was enough to take the concept off the list.
 * That is right for almost everything —the rent is paid once and that is
 * it—, but not for what is covered in pieces: the first trip to the market
 * took «Mercado» off pending payments, and for the rest of the month the only
 * screen that answers «what do I still have to pay?» said nothing, with
 * 320,000 paid out of 1,200,000. The figure was not wrong anywhere: it was
 * missing exactly where it was asked for.
 *
 * ── What changes, and what does NOT ─────────────────────────────────────────
 * It only changes for MARKED concepts, and only when there is an expected
 * figure above zero. Without a total to reach there is no «what is missing»:
 * a marked concept with neither budget nor history behaves as always, because
 * the alternative would be leaving it pending forever —it would never reach a
 * total that does not exist— and a pending payment that cannot be settled is
 * permanent noise in the list.
 *
 * ── Why the budget takes the LARGER of the two ──────────────────────────────
 * That card asks «how much money do I need this month?». While it is being
 * covered, the answer is the expected amount: what was paid is an advance on
 * it, not something added on top. But when what was paid EXCEEDS the expected
 * amount —the groceries came out dearer— the answer becomes what was paid,
 * which is already a fact. Staying at the expected amount would say the month
 * cost less than it did, and adding both would count it twice.
 */
export function pendingOutcome({
  isMultiPayment,
  hasPayment,
  paid,
  expected,
}: {
  isMultiPayment: boolean;
  /**
   * Whether there is any cleared movement, even one that adds up to zero.
   *
   * It asks about EXISTENCE and not `paid > 0` on purpose: that is how it
   * behaved before, and a zero movement is someone saying «this cost nothing
   * this month», which is an answer and not a gap.
   */
  hasPayment: boolean;
  paid: Money;
  expected: Money | null;
}): { isStillDue: boolean; towardBudget: Money } {
  if (isMultiPayment && expected?.gt(ZERO)) {
    return {
      isStillDue: paid.lt(expected),
      towardBudget: paid.gt(expected) ? paid : expected,
    };
  }

  // The usual: on the first cleared movement it stops being due, and the month
  // counts what it really cost.
  if (hasPayment) return { isStillDue: false, towardBudget: paid };
  return { isStillDue: true, towardBudget: expected ?? ZERO };
}
