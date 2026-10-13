/**
 * The pauses of a recurring concept as the service hands them out (ADR 0036).
 * Months are `YYYY-MM`.
 */

/** A period in which the concept does not renew: `[fromMonth, resumeMonth)`. */
export interface RecurrencePause {
  id: bigint;
  categoryId: bigint;
  /** The first paused month. */
  fromMonth: string;
  /** The first month active again; `null` while it has no end. */
  resumeMonth: string | null;
}

/** An automatic charge already written in a month the pause covers. */
export interface PausedCharge {
  /** The movement's id. */
  id: bigint;
  /** The month it was charged for. */
  month: string;
  /** The day it was charged, `YYYY-MM-DD`. */
  date: string;
  conceptName: string;
}

export interface DiscardedCharges {
  /** Movements deleted. */
  deleted: number;
}
