/**
 * How money and dates are written in the interface: the ONE place where
 * `Intl` is called, always with `es-CO` (step 7.3).
 *
 * The words themselves —month and weekday names— come from `Intl`, not from a
 * list typed by hand: there used to be four copies of the months (here, the
 * movements table, the trend chart and the recurrence fields), each one free
 * to drift. What is still composed by hand is the ORDER, where Coco reads
 * differently from what `Intl` offers (`6 sep 2026`, not `6 de sept de 2026`).
 *
 * ── Long and short, and when each one goes ─────────────────────────────────
 * LONG where a specific date is read and there is room: the range button and
 * the chart card. There, "sep 26" forces decoding an abbreviation and guessing
 * whether 26 is a day or a year.
 *
 * SHORT on the chart axis and in the table, where there are dozens of dates
 * and the full name would make them collide.
 */

const LOCALE = 'es-CO';

// ── Dates ───────────────────────────────────────────────────────────────────

/** Every date here is a calendar day, never an instant: read it in UTC. */
const utc = (year: number, month: number, day = 1): Date =>
  new Date(Date.UTC(year, month - 1, day));
const inUtc = (options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat =>
  new Intl.DateTimeFormat(LOCALE, { ...options, timeZone: 'UTC' });

const monthName = inUtc({ month: 'long' });

/** The app's clock is Bogotá's (UTC−5), which has no daylight saving time. */
const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000;

/**
 * Today in America/Bogota, as `YYYY-MM-DD`.
 *
 * A bare `new Date().toISOString()` gives the UTC day, which between 19:00
 * and midnight in Bogotá is already TOMORROW: the calendar ringed a day that
 * had not started and the ranges ended on it. And the browser's local day is
 * no better: it moves with whoever travels. The app's day is Bogotá's, the
 * same for everyone, and it is computed in exactly one place.
 */
export function todayInBogota(): string {
  return new Date(Date.now() - BOGOTA_OFFSET_MS).toISOString().slice(0, 10);
}
const weekdayName = inUtc({ weekday: 'long' });
const longDayFormat = inUtc({ day: 'numeric', month: 'long', year: 'numeric' });
const longMonthFormat = inUtc({ month: 'long', year: 'numeric' });
const dayAndMonthFormat = inUtc({ day: 'numeric', month: 'long' });

/** `enero` … `diciembre`. */
export const LONG_MONTHS: readonly string[] = Array.from({ length: 12 }, (_, i) =>
  monthName.format(utc(2026, i + 1)),
);

/** `ene` … `dic`: the first three letters, without the dot `Intl` adds. */
export const SHORT_MONTHS: readonly string[] = LONG_MONTHS.map((month) => month.slice(0, 3));

/**
 * `lu` … `do`. The week starts on MONDAY, not Sunday: that is how a calendar
 * is read in Colombia, and the weekend stays together at the end of the row.
 * (5 January 2026 is a Monday.)
 */
export const WEEKDAYS: readonly string[] = Array.from({ length: 7 }, (_, i) =>
  weekdayName.format(utc(2026, 1, 5 + i)).slice(0, 2),
);

export const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

const parts = (iso: string): { year: string; month: number; day: number } => {
  // `split` always returns at least one piece: the year is never missing.
  const [year = '', month, day] = iso.split('-');
  return { year, month: Number(month), day: Number(day) };
};

/** What `Intl` can take without throwing; anything else is written as it came. */
const isValidMonth = (month: number): boolean =>
  Number.isInteger(month) && month >= 1 && month <= 12;
const isValidDay = (year: string, month: number, day: number): boolean =>
  /^\d{4}$/.test(year) && isValidMonth(month) && Number.isInteger(day) && day >= 1 && day <= 31;

/** `2026-09-06` → `6 de septiembre de 2026`. */
export function longDay(iso: string): string {
  const { year, month, day } = parts(iso);
  if (!isValidDay(year, month, day)) return iso;
  return longDayFormat.format(utc(Number(year), month, day));
}

/** `2026-09-06` → `6 sep 2026`. For tables and axes. */
export function shortDay(iso: string): string {
  const { year, month, day } = parts(iso);
  return `${day} ${SHORT_MONTHS[month - 1] ?? month} ${year}`;
}

/** `2026-03` or `2026-03-01` → `mar 2026`. A period is a month, not a day. */
export function shortMonth(iso: string): string {
  const { year, month } = parts(iso);
  return `${SHORT_MONTHS[month - 1] ?? month} ${year}`;
}

/** `2026-09` or `2026-09-01` → `Septiembre de 2026`. */
export function longMonth(iso: string): string {
  const { year, month } = parts(iso);
  if (!isValidDay(year, month, 1)) return iso;
  return capitalize(longMonthFormat.format(utc(Number(year), month)));
}

/**
 * A range written out: `6 de septiembre — 15 de septiembre de 2026`.
 *
 * The year is written once when the range does not cross it. Repeating it at
 * both ends takes room without saying anything new. The month also goes from
 * the first end when both fall in the same one.
 */
export function longRange(from: string, to: string): string {
  const a = parts(from);
  const b = parts(to);

  if (a.year !== b.year || !isValidDay(a.year, a.month, a.day))
    return `${longDay(from)} — ${longDay(to)}`;
  if (a.month !== b.month) {
    return `${dayAndMonthFormat.format(utc(Number(a.year), a.month, a.day))} — ${longDay(to)}`;
  }
  return `${a.day} — ${longDay(to)}`;
}

/** An instant —an audit-log event—, in the person's own time zone. */
export const dateTime = new Intl.DateTimeFormat(LOCALE, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

// ── Money ───────────────────────────────────────────────────────────────────

/**
 * The currency of anything that is not a single movement: totals, averages,
 * budgets. A sum mixes rows and has no currency of its own; today every row is
 * COP, so the sum is too. (Phase 6.4 added `transactions.currency`; a movement
 * is formatted with its own.)
 */
export const DEFAULT_CURRENCY = 'COP';

interface MoneyFormatters {
  whole: Intl.NumberFormat;
  withCents: Intl.NumberFormat;
}

/** One pair of formatters per currency, built on first use: Intl formatters are costly to create. */
const formattersByCurrency = new Map<string, MoneyFormatters>();

function formattersFor(currency: string): MoneyFormatters {
  let formatters = formattersByCurrency.get(currency);
  if (!formatters) {
    const options = { style: 'currency', currency } as const;
    formatters = {
      whole: new Intl.NumberFormat(LOCALE, {
        ...options,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }),
      withCents: new Intl.NumberFormat(LOCALE, {
        ...options,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    };
    formattersByCurrency.set(currency, formatters);
  }
  return formatters;
}

/**
 * Formats an amount for DISPLAY in the given currency.
 *
 * It takes the decimal string the API sends. It becomes a number only here, at
 * the presentation edge: no money arithmetic is ever done with the result.
 * Cents are hidden when they are `.00`, which is the normal case in COP.
 */
export function formatMoney(amount: string | number, currency: string = DEFAULT_CURRENCY): string {
  const value = typeof amount === 'string' ? Number.parseFloat(amount) : amount;
  if (!Number.isFinite(value)) return '—';

  const { whole, withCents } = formattersFor(currency);
  const hasCents = Math.round(value * 100) % 100 !== 0;
  return (hasCents ? withCents : whole).format(value);
}

/** An aggregate —no row of its own— in the default currency. */
export function formatCOP(amount: string | number): string {
  return formatMoney(amount, DEFAULT_CURRENCY);
}
