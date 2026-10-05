import type { FlagDefinition } from './registry';

/** Days past `removeBy` that CI tolerates with a warning before it fails. */
export const GRACE_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface RetirementReport {
  /** Past `removeBy`, still inside the grace period. */
  readonly warnings: readonly string[];
  /** Past the grace period, or with a date that does not parse. */
  readonly failures: readonly string[];
}

/** `YYYY-MM-DD` → UTC midnight, or `null` if it is not a real date. */
function parseDay(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(time)) return null;
  // `Date.parse` rolls 2027-02-30 over to March; a real date round-trips.
  return new Date(time).toISOString().slice(0, 10) === value ? time : null;
}

/** Which flags have outlived their retirement date, as of `today` (`YYYY-MM-DD`). */
export function checkRetirement(
  flags: Readonly<Record<string, FlagDefinition>>,
  today: string,
): RetirementReport {
  const now = parseDay(today);
  if (now === null) throw new Error(`"${today}" is not a YYYY-MM-DD date`);

  const warnings: string[] = [];
  const failures: string[] = [];
  for (const [name, flag] of Object.entries(flags)) {
    const removeBy = parseDay(flag.removeBy);
    if (removeBy === null) {
      failures.push(`${name}: removeBy "${flag.removeBy}" is not a YYYY-MM-DD date`);
      continue;
    }
    const daysLate = Math.floor((now - removeBy) / DAY_MS);
    if (daysLate <= 0) continue;
    const line = `${name}: ${daysLate} day(s) past its removeBy ${flag.removeBy} (owner: ${flag.owner})`;
    if (daysLate > GRACE_DAYS) failures.push(line);
    else warnings.push(line);
  }
  return { warnings, failures };
}
