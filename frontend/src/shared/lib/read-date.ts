/**
 * Reading a date written by a person or by a bank.
 *
 * It lives in `lib` and not in the import because both use it: a statement's
 * CSV and a form's date field, where you can type instead of opening the
 * calendar. It is the same problem —a text that has to be understood— and a
 * second copy would end up understanding different things depending on where
 * it is typed.
 *
 * There are three common forms and none is negotiable with the bank:
 *   `01/08/2026` · `2026-08-01` · `01 AGO` (no year, inside a monthly statement)
 *
 * ── The ambiguity of 01/08 ──────────────────────────────────────────────────
 * August 1 or January 8? In Colombia the order is DAY/MONTH, and that is how
 * it is read. The ISO format `2026-08-01` is recognized separately by its
 * shape, which is unmistakable.
 */

// The Spanish month names a receipt or a statement may use, by month number.
// They are data (what the bank writes), so they are strings and not keys.
const MONTHS: Record<string, number> = Object.fromEntries(
  [
    ['ene', 'enero'],
    ['feb', 'febrero'],
    ['mar', 'marzo'],
    ['abr', 'abril'],
    ['may', 'mayo'],
    ['jun', 'junio'],
    ['jul', 'julio'],
    ['ago', 'agosto'],
    ['sep', 'sept', 'septiembre'],
    ['oct', 'octubre'],
    ['nov', 'noviembre'],
    ['dic', 'diciembre'],
  ].flatMap((names, i) => names.map((name) => [name, i + 1])),
);

export interface ParsedDate {
  /** `YYYY-MM-DD`, which is what the API expects. */
  iso: string;
  start: number;
  end: number;
}

/** ISO first: its shape is unmistakable and there is nothing to guess. */
const ISO = /\b(\d{4})-(\d{2})-(\d{2})\b/;
/** Day/month/year, with a 2- or 4-digit year, or no year. */
const DAY_MONTH = /\b(\d{1,2})[/\-.](\d{1,2})(?:[/\-.](\d{2,4}))?\b/;
/** `01 AGO 2026`, `1 de agosto`, `AGO 01`. */
const WITH_MONTH_NAME = new RegExp(
  String.raw`\b(?:(\d{1,2})\s*(?:de\s+)?([a-záéíóú]{3,10})|([a-záéíóú]{3,10})\s*(\d{1,2}))\.?(?:\s+(?:de\s+)?(\d{4}))?\b`,
  'i',
);

/**
 * Finds the first date in a line.
 *
 * `defaultYear` covers the most common case of all: a monthly statement that
 * writes "01 AGO" without a year because the year is in the header. Without
 * it, every line would have to be fixed by hand.
 */
export function findDate(line: string, defaultYear: number): ParsedDate | null {
  const iso = ISO.exec(line);
  if (iso) {
    return {
      iso: `${iso[1]}-${iso[2]}-${iso[3]}`,
      start: iso.index,
      end: iso.index + iso[0].length,
    };
  }

  const withMonth = WITH_MONTH_NAME.exec(line);
  if (withMonth) {
    const day = Number(withMonth[1] ?? withMonth[4]);
    const name = (withMonth[2] ?? withMonth[3] ?? '').toLowerCase();
    const month = MONTHS[stripAccents(name)];

    if (month && day >= 1 && day <= 31) {
      const year = withMonth[5] ? Number(withMonth[5]) : defaultYear;
      return build(year, month, day, withMonth.index, withMonth.index + withMonth[0].length);
    }
  }

  const dayMonth = DAY_MONTH.exec(line);
  if (dayMonth) {
    // Day first: in Colombia 01/08 is August 1, not January 8.
    const day = Number(dayMonth[1]);
    const month = Number(dayMonth[2]);
    const year = dayMonth[3] ? fullYear(Number(dayMonth[3])) : defaultYear;

    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return build(year, month, day, dayMonth.index, dayMonth.index + dayMonth[0].length);
    }
  }

  return null;
}

/** `26` → 2026. Statements with a two-digit year still exist. */
function fullYear(year: number): number {
  if (year >= 1000) return year;
  return year < 70 ? 2000 + year : 1900 + year;
}

/**
 * Builds the date, checking that it EXISTS.
 *
 * `31/02` is not a date; letting it through would turn it into March 3 when
 * saved, which is exactly the kind of silent error that unbalances a
 * statement without anyone knowing why.
 */
function build(
  year: number,
  month: number,
  day: number,
  start: number,
  end: number,
): ParsedDate | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;

  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return { iso, start, end };
}

function stripAccents(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '');
}
