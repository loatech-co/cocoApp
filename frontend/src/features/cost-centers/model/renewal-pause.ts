import type { RecurrencePause } from '@/shared/api/generated/model';

/**
 * Where the renewal of a recurring concept stands, read from its pauses
 * (ADR 0036). Never stored: the pauses are the history, and «is it paused» is
 * derived from them and today's month. Months are `YYYY-MM`.
 */
export type RenewalState =
  | { kind: 'active' }
  /** Paused since `from`, with no end yet. */
  | { kind: 'paused'; from: string }
  /** Will pause from `from`, a month still ahead. */
  | { kind: 'scheduled'; from: string }
  /** Paused now, active again from `resume`. */
  | { kind: 'resuming'; resume: string };

/** The pause with no end yet, if there is one: what «Reactivar» acts on. */
export function openPause(pauses: readonly RecurrencePause[]): RecurrencePause | undefined {
  return pauses.find((pause) => pause.resumeMonth === null);
}

export function renewalState(pauses: readonly RecurrencePause[], today: string): RenewalState {
  const open = openPause(pauses);
  if (open) {
    return open.fromMonth <= today
      ? { kind: 'paused', from: open.fromMonth }
      : { kind: 'scheduled', from: open.fromMonth };
  }
  const current = pauses.find(
    (pause) => pause.fromMonth <= today && pause.resumeMonth !== null && today < pause.resumeMonth,
  );
  return current?.resumeMonth
    ? { kind: 'resuming', resume: current.resumeMonth }
    : { kind: 'active' };
}

/** `2026-12` → `2026-11`: the last paused month of a period that resumes in December. */
export function previousMonth(month: string): string {
  const [year = NaN, m = NaN] = month.split('-').map(Number);
  return new Date(Date.UTC(year, m - 2, 1)).toISOString().slice(0, 7);
}

/** `2026-12` → `2027-01`. */
export function nextMonth(month: string): string {
  const [year = NaN, m = NaN] = month.split('-').map(Number);
  return new Date(Date.UTC(year, m, 1)).toISOString().slice(0, 7);
}

/**
 * The years the month picker offers: five back and five ahead of today, and
 * the one of the month already chosen if it falls outside. A pause can be
 * recorded late or scheduled early (ADR 0036), but not a century away.
 */
export function yearOptions(today: string, chosen: string): string[] {
  const current = Number(today.slice(0, 4));
  const years = new Set(Array.from({ length: 11 }, (_, i) => String(current - 5 + i)));
  years.add(chosen.slice(0, 4));
  return [...years].sort();
}

/** The month a question starts on: today, or the first one after the pause began. */
export function suggestedMonth(today: string, after?: string): string {
  if (after === undefined) return today;
  const earliest = nextMonth(after);
  return earliest > today ? earliest : today;
}
