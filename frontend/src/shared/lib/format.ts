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

export const LOCALE = 'es-CO';

// ── Dates ───────────────────────────────────────────────────────────────────

/** Every date here is a calendar day, never an instant: read it in UTC. */
const utc = (anio: number, mes: number, dia = 1): Date => new Date(Date.UTC(anio, mes - 1, dia));
const enUTC = (opciones: Intl.DateTimeFormatOptions): Intl.DateTimeFormat =>
  new Intl.DateTimeFormat(LOCALE, { ...opciones, timeZone: 'UTC' });

const nombreDelMes = enUTC({ month: 'long' });
const nombreDelDia = enUTC({ weekday: 'long' });
const formatoDiaLargo = enUTC({ day: 'numeric', month: 'long', year: 'numeric' });
const formatoMesLargo = enUTC({ month: 'long', year: 'numeric' });
const formatoDiaYMes = enUTC({ day: 'numeric', month: 'long' });

/** `enero` … `diciembre`. */
export const MESES_LARGOS: readonly string[] = Array.from({ length: 12 }, (_, i) =>
  nombreDelMes.format(utc(2026, i + 1)),
);

/** `ene` … `dic`: the first three letters, without the dot `Intl` adds. */
export const MESES_CORTOS: readonly string[] = MESES_LARGOS.map((mes) => mes.slice(0, 3));

/**
 * `lu` … `do`. The week starts on MONDAY, not Sunday: that is how a calendar
 * is read in Colombia, and the weekend stays together at the end of the row.
 * (5 January 2026 is a Monday.)
 */
export const DIAS_DE_LA_SEMANA: readonly string[] = Array.from({ length: 7 }, (_, i) =>
  nombreDelDia.format(utc(2026, 1, 5 + i)).slice(0, 2),
);

export const conMayuscula = (texto: string): string =>
  texto.charAt(0).toUpperCase() + texto.slice(1);

const partes = (iso: string): { anio: string; mes: number; dia: number } => {
  // `split` always returns at least one piece: the year is never missing.
  const [anio = '', mes, dia] = iso.split('-');
  return { anio, mes: Number(mes), dia: Number(dia) };
};

/** What `Intl` can take without throwing; anything else is written as it came. */
const mesValido = (mes: number): boolean => Number.isInteger(mes) && mes >= 1 && mes <= 12;
const diaValido = (anio: string, mes: number, dia: number): boolean =>
  /^\d{4}$/.test(anio) && mesValido(mes) && Number.isInteger(dia) && dia >= 1 && dia <= 31;

/** `2026-09-06` → `6 de septiembre de 2026`. */
export function diaLargo(iso: string): string {
  const { anio, mes, dia } = partes(iso);
  if (!diaValido(anio, mes, dia)) return iso;
  return formatoDiaLargo.format(utc(Number(anio), mes, dia));
}

/** `2026-09-06` → `6 sep 2026`. For tables and axes. */
export function diaCorto(iso: string): string {
  const { anio, mes, dia } = partes(iso);
  return `${dia} ${MESES_CORTOS[mes - 1] ?? mes} ${anio}`;
}

/** `2026-03` or `2026-03-01` → `mar 2026`. A period is a month, not a day. */
export function mesCorto(iso: string): string {
  const { anio, mes } = partes(iso);
  return `${MESES_CORTOS[mes - 1] ?? mes} ${anio}`;
}

/** `2026-09` or `2026-09-01` → `Septiembre de 2026`. */
export function mesLargo(iso: string): string {
  const { anio, mes } = partes(iso);
  if (!diaValido(anio, mes, 1)) return iso;
  return conMayuscula(formatoMesLargo.format(utc(Number(anio), mes)));
}

/**
 * A range written out: `6 de septiembre — 15 de septiembre de 2026`.
 *
 * The year is written once when the range does not cross it. Repeating it at
 * both ends takes room without saying anything new. The month also goes from
 * the first end when both fall in the same one.
 */
export function rangoLargo(desde: string, hasta: string): string {
  const a = partes(desde);
  const b = partes(hasta);

  if (a.anio !== b.anio || !diaValido(a.anio, a.mes, a.dia))
    return `${diaLargo(desde)} — ${diaLargo(hasta)}`;
  if (a.mes !== b.mes) {
    return `${formatoDiaYMes.format(utc(Number(a.anio), a.mes, a.dia))} — ${diaLargo(hasta)}`;
  }
  return `${a.dia} — ${diaLargo(hasta)}`;
}

/** An instant —an audit-log event—, in the person's own time zone. */
export const fechaYHora = new Intl.DateTimeFormat(LOCALE, {
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
