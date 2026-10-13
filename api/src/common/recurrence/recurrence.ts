import type { Periodicity } from '../vocabulary';

/**
 * When a recurring concept is due, in one place (ADR 0036).
 *
 * The auto-charge task, the pending-payments list and the month's budget all
 * ask the same question —«is this concept due in month M?»— and before the
 * pauses each asked it on its own. With the pauses the answer has two parts,
 * the cycle and the paused periods, and two callers that combined them in
 * two places would one day disagree: a concept charged on its own in a month
 * the pending list says is paused. So every caller goes through
 * `isConceptDueInMonth`.
 *
 * Months travel as `YYYY-MM`; a `YYYY-MM-DD` is read by its month.
 */

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
 * Whether the CYCLE of a recurring concept falls in a given month, pauses
 * aside.
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
 * A period in which the concept does not renew: half-open,
 * `[fromMonth, resumeMonth)`. `resumeMonth` is the first month active again,
 * and `null` means there is no end yet.
 */
export interface PausePeriod {
  fromMonth: string;
  resumeMonth: string | null;
}

/** Whether `month` falls inside one of the periods. */
export function isPausedIn(pauses: readonly PausePeriod[], month: string): boolean {
  const m = month.slice(0, 7);
  return pauses.some(
    (p) => p.fromMonth <= m && (p.resumeMonth === null || m < p.resumeMonth.slice(0, 7)),
  );
}

/**
 * Whether two periods share at least one month. Half-open, so a period that
 * resumes in December and one that starts in December do not overlap.
 */
export function periodsOverlap(a: PausePeriod, b: PausePeriod): boolean {
  const isABeforeBEnds = b.resumeMonth === null || a.fromMonth < b.resumeMonth;
  const isBBeforeAEnds = a.resumeMonth === null || b.fromMonth < a.resumeMonth;
  return isABeforeBEnds && isBBeforeAEnds;
}

/** What decides whether a recurring concept is due in a month. */
export interface DueRule {
  periodicity: Periodicity;
  /** The cycle's reference month, 1–12; `null` for monthly. */
  paymentMonth: number | null;
  pauses: readonly PausePeriod[];
}

/**
 * THE question: is this recurring concept due in `month`?
 *
 * Its cycle has to fall there AND no pause may cover it. A pause does not
 * move the cycle: a quarterly concept paused from February to May loses the
 * March payment and is due again in June, as it always was.
 */
export function isConceptDueInMonth(rule: DueRule, month: string): boolean {
  return (
    isDueInMonth(rule.periodicity, rule.paymentMonth, month) && !isPausedIn(rule.pauses, month)
  );
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
  return `${chargeFingerprintPrefix(categoryId)}${month.slice(0, 7)}`;
}

/**
 * What every automatic charge of a concept starts with. It is how a charge
 * the task wrote is told apart from one recorded by hand, which never carries
 * an `auto:` reference (ADR 0036).
 */
export function chargeFingerprintPrefix(categoryId: bigint): string {
  return `auto:${categoryId.toString()}:`;
}

/** The month (`YYYY-MM`) an automatic charge's fingerprint was written for. */
export function monthOfFingerprint(externalRef: string): string {
  return externalRef.slice(externalRef.lastIndexOf(':') + 1);
}
