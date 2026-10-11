/**
 * ── The month a movement belongs to ──────────────────────────────────────────
 * `period` is always the FIRST day of a month: the list, the dashboard and
 * the recurring checks compare it for equality, so a `period` on the 15th
 * would belong to no month at all.
 */

/**
 * The first day of the month of a date.
 *
 * It is the default of `period`: most expenses belong to the month they were
 * paid in, and making every record declare it would be friction for the
 * common case. Only the bills that cross months need to say it.
 */
function monthOf(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

/** The month to store: the one asked for, snapped to its first day, or that of `date`. */
export function periodOf(requested: string | undefined, date: Date): Date {
  return monthOf(requested ? new Date(requested) : date);
}

/**
 * The month a PATCH leaves the movement in, or `undefined` to keep it.
 *
 * An explicit `period` wins. Without one, a new `date` drags the month with
 * it, unless the movement was already in a month other than its date's: that
 * was said on purpose (a bill paid in April for March), and moving the date
 * must not undo it.
 */
export function periodChange(
  edit: { period?: string | undefined; date?: string | undefined },
  actual: { date: Date; period: Date },
): Date | undefined {
  if (edit.period !== undefined) return monthOf(new Date(edit.period));
  if (edit.date === undefined) return undefined;
  const wasExplicit = actual.period.getTime() !== monthOf(actual.date).getTime();
  return wasExplicit ? undefined : monthOf(new Date(edit.date));
}
