/** A period in which a recurring concept does not renew: `[fromMonth, resumeMonth)` (ADR 0036). */
export class RecurrencePause {
  id!: number;
  categoryId!: number;
  /** The first paused month, `YYYY-MM`. */
  fromMonth!: string;
  /** The first month active again, `YYYY-MM`; `null` while it has no end. */
  resumeMonth!: string | null;
}

/** An automatic charge already written in a month the pause covers. */
export class PausedCharge {
  /** The movement's id. */
  id!: number;
  /** The month it was charged for, `YYYY-MM`. */
  month!: string;
  /** The day it was charged, `YYYY-MM-DD`. */
  date!: string;
  conceptName!: string;
}

export class DiscardedCharges {
  /** Movements deleted. */
  deleted!: number;
}
