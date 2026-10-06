/**
 * When it was paid, read from a receipt.
 *
 * Several forms live together in Colombian receipts and none is negotiable:
 *   `04/01/2022` · `2022-01-04` · `04 Enero 2022` · `31-octubre-2023` · `04/ene/2022`
 *
 * ── The 04/01 ambiguity ─────────────────────────────────────────────────────
 * January 4th or April 1st? In Colombia the order is DAY/MONTH. The ISO
 * `2022-01-04` is recognised apart by its shape, which cannot be mistaken.
 *
 * ── Why the one in the period wins ──────────────────────────────────────────
 * A receipt carries several dates: issue, due date, suspension, next billing
 * cut. The one that matters is the payment, and the only reliable hint of
 * which one that is, is the month the expense belongs to: among all the dates
 * read, the one that falls in that month.
 */

// Spanish month names, as receipts print them: data, not code, hence strings.
const MONTHS: Record<string, number> = Object.fromEntries([
  ['ene', 1],
  ['enero', 1],
  ['feb', 2],
  ['febrero', 2],
  ['mar', 3],
  ['marzo', 3],
  ['abr', 4],
  ['abril', 4],
  ['may', 5],
  ['mayo', 5],
  ['jun', 6],
  ['junio', 6],
  ['jul', 7],
  ['julio', 7],
  ['ago', 8],
  ['agosto', 8],
  ['sep', 9],
  ['sept', 9],
  ['septiembre', 9],
  ['setiembre', 9],
  ['oct', 10],
  ['octubre', 10],
  ['nov', 11],
  ['noviembre', 11],
  ['dic', 12],
  ['diciembre', 12],
]);

const ISO = /\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/g;
const DAY_MONTH_YEAR = /\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2}|\d{2})\b/g;
const WITH_MONTH_NAME = new RegExp(
  String.raw`\b(\d{1,2})\s*[-/ ]?\s*(?:de\s+)?(${Object.keys(MONTHS).join('|')})\w*\s*[-/ ]?\s*(?:de\s+)?(20\d{2})\b`,
  'gi',
);

export interface DateCandidate {
  iso: string;
  /** Whether it falls in the month the expense belongs to. */
  inPeriod: boolean;
}

const isValidDate = (a: number, m: number, d: number): boolean =>
  m >= 1 && m <= 12 && d >= 1 && d <= 31 && a >= 2000 && a <= 2100;

const toIso = (a: number, m: number, d: number): string =>
  `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** Every date in the text, in the order it appears. */
export function datesIn(text: string): string[] {
  const found: string[] = [];
  const record = (a: number, m: number, d: number): void => {
    if (isValidDate(a, m, d)) found.push(toIso(a, m, d));
  };

  // The groups of the three patterns are mandatory: the `= ''` are never used.
  for (const [, a = '', m = '', d = ''] of text.matchAll(ISO)) record(+a, +m, +d);
  for (const [, d = '', m = '', a = ''] of text.matchAll(DAY_MONTH_YEAR)) {
    // A two-digit year: 22 is 2022, not 1922. These receipts are not older.
    record(a.length === 2 ? 2000 + +a : +a, +m, +d);
  }
  for (const [, d = '', month = '', a = ''] of text.matchAll(WITH_MONTH_NAME)) {
    const m = MONTHS[month.toLowerCase().slice(0, 4)] ?? MONTHS[month.toLowerCase().slice(0, 3)];
    if (m) record(+a, m, +d);
  }

  return [...new Set(found)];
}

/**
 * The payment date.
 *
 * `period` is the month the expense belongs to, as `YYYY-MM`. If there is a
 * date in that month, that is the one. If none can be read, it falls back to
 * the 15th: the middle of the month, so the worst error is two weeks and it
 * never lands in another month —the error that breaks a summary—.
 */
export function readDate(text: string, period?: string): DateCandidate | null {
  const all = datesIn(text);

  if (period) {
    const ofPeriod = all.filter((f) => f.startsWith(period));
    // The first one in the month: on a receipt the issue date comes before
    // the due date, and the payment date is closer to the first.
    const [firstOfPeriod] = ofPeriod;
    if (firstOfPeriod !== undefined) return { iso: firstOfPeriod, inPeriod: true };
  }

  const [first] = all;
  if (first !== undefined) return { iso: first, inPeriod: false };
  if (period) return { iso: `${period}-15`, inPeriod: false };
  return null;
}
