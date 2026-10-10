import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useHistory } from '@/features/transactions/api/transactions';
import { t } from '@/shared/lib/i18n';

/**
 * Filters shared by the Resumen and the Movimientos.
 *
 * ── Why they live in the URL ────────────────────────────────────────────────
 * Because they are the CUT the person is looking at, not internal state of
 * a screen. When jumping from the dashboard to the transactions the cut is kept,
 * the back button works, and a link pasted to someone opens exactly the
 * same. Kept in memory, every jump would lose them.
 */

export type Preset =
  'all' | 'this-month' | 'last-month' | 'last-3-months' | 'this-year' | 'last-year' | 'custom';

export const PRESETS: { value: Preset; label: string; help: string }[] = [
  {
    value: 'all',
    label: t('transactions.range.presets.all'),
    help: t('transactions.range.presets.allHelp'),
  },
  {
    value: 'this-month',
    label: t('transactions.range.presets.thisMonth'),
    help: t('transactions.range.presets.thisMonthHelp'),
  },
  {
    value: 'last-month',
    label: t('transactions.range.presets.lastMonth'),
    help: t('transactions.range.presets.lastMonthHelp'),
  },
  {
    value: 'last-3-months',
    label: t('transactions.range.presets.last3Months'),
    help: t('transactions.range.presets.last3MonthsHelp'),
  },
  {
    value: 'this-year',
    label: t('transactions.range.presets.thisYear'),
    help: t('transactions.range.presets.thisYearHelp'),
  },
  {
    value: 'last-year',
    label: t('transactions.range.presets.lastYear'),
    help: t('transactions.range.presets.lastYearHelp'),
  },
  {
    value: 'custom',
    label: t('transactions.range.presets.custom'),
    help: t('transactions.range.presets.customHelp'),
  },
];

/**
 * Today in America/Bogota (UTC−5, no daylight saving time).
 *
 * A bare `new Date()` is not used: the browser can be in another zone, and
 * then "today" would change depending on where the person is. The app's month has
 * to start and end the same for everyone.
 */
function todayInBogota(): Date {
  const now = new Date();
  return new Date(now.getTime() - 5 * 60 * 60 * 1000);
}

const aISO = (date: Date): string => date.toISOString().slice(0, 10);

/** Today in Bogotá, as `YYYY-MM-DD`. */
function todayIso(): string {
  return aISO(todayInBogota());
}

/**
 * Whether the cut being looked at reaches today.
 *
 * The pieces that talk about the CURRENT MONTH —the necessary budget and
 * the pending payments— use it to know whether they have something to say. Looking at August
 * 2024, "what is left to pay this month" is not a late answer: it is the
 * answer to another question, placed next to the figures of a period that has already
 * closed. And there nothing is pending, because it already happened.
 */
export function reachesToday(filters: { to: string }): boolean {
  return filters.to >= todayIso();
}
const utc = (year: number, month: number, day: number): Date =>
  new Date(Date.UTC(year, month, day));

/**
 * The date range a preset stands for.
 *
 * `history` is the dates of the first and the last transaction. Only
 * "Todo" uses it, and it is optional because it comes from a query: while it is not there, it falls
 * back to a wide range, which returns exactly the same transactions.
 */
export function rangeOf(
  preset: Preset,
  history?: { first: string | null; last: string | null },
): { from: string; to: string } {
  const today = todayInBogota();
  const a = today.getUTCFullYear();
  const m = today.getUTCMonth();
  const d = today.getUTCDate();

  switch (preset) {
    case 'all':
      // It starts at the FIRST transaction, not in 1970: with 1970 the chart
      // stretched its axis over half an empty century to draw four years of
      // data, and the date button promised a period that never existed.
      return {
        from: history?.first ?? '1970-01-01',
        to: history?.last ?? aISO(utc(a + 5, 11, 31)),
      };

    case 'this-month':
      // UP TO TODAY, not to the end of the month: including days that have not happened
      // would flatten any average and make it look like less was spent.
      return { from: aISO(utc(a, m, 1)), to: aISO(utc(a, m, d)) };

    case 'last-month':
      return { from: aISO(utc(a, m - 1, 1)), to: aISO(utc(a, m, 0)) };

    case 'last-3-months':
      // Three months back from today, not "the calendar quarter": on April
      // 2 you want to see January–April, not just the two days of April.
      return { from: aISO(utc(a, m - 2, 1)), to: aISO(utc(a, m, d)) };

    case 'this-year':
      return { from: aISO(utc(a, 0, 1)), to: aISO(utc(a, m, d)) };

    case 'last-year':
      return { from: aISO(utc(a - 1, 0, 1)), to: aISO(utc(a - 1, 11, 31)) };

    case 'custom':
    default:
      return { from: aISO(utc(a, m, 1)), to: aISO(utc(a, m, d)) };
  }
}

export interface Filters {
  preset: Preset;
  from: string;
  to: string;
  /**
   * Checked cost centers, categories or concepts. Each one includes its branch.
   *
   * It is a LIST because the panel is checkboxes: the question "how much do Casa
   * and Transporte cost me together?" cannot be asked with a single id.
   */
  categoryIds: number[];
  q?: string | undefined;
}

/**
 * Reads and writes the filters in the URL.
 *
 * The preset is saved on top of the range on purpose. Saving only the dates
 * would force guessing which button was active, and "from September 1 to 30"
 * can be both "mes en curso" and a range typed by hand: they are different
 * states, because the first one moves by itself the next day.
 */
export function useFilters(defaultPreset: Preset = 'this-month'): {
  filters: Filters;
  apply: (changes: Partial<Filters>) => void;
  clear: () => void;
  hasActiveFilters: boolean;
} {
  const [params, setParams] = useSearchParams();
  const history = useHistory();

  const filters = useMemo<Filters>(() => {
    const current = withCurrentNames(params);
    const preset = presetOf(current.get('range')) ?? defaultPreset;
    const range = rangeOf(preset, history.data);

    return {
      preset,
      from: preset === 'custom' ? (current.get('from') ?? range.from) : range.from,
      to: preset === 'custom' ? (current.get('to') ?? range.to) : range.to,
      categoryIds: (current.get('categories') ?? '')
        .split(',')
        .map((n) => Number(n))
        .filter((n) => Number.isInteger(n) && n > 0),
      q: current.get('q') ?? undefined,
    };
  }, [params, defaultPreset, history.data]);

  const apply = useCallback(
    (changes: Partial<Filters>) => {
      const next = writeFilters(params, changes, defaultPreset);

      setParams(next, { replace: true });
    },
    [params, setParams, defaultPreset],
  );

  const clear = useCallback(() => setParams(new URLSearchParams(), { replace: true }), [setParams]);

  const hasActiveFilters =
    filters.preset !== defaultPreset || filters.categoryIds.length > 0 || (filters.q ?? '') !== '';

  return { filters, apply, clear, hasActiveFilters };
}

/** The filters as the API expects them. */
export function toApiParams(filters: Filters): {
  from: string;
  to: string;
  categoryIds?: string;
  q?: string;
} {
  return {
    from: filters.from,
    to: filters.to,
    ...(filters.categoryIds.length > 0 && { categoryIds: filters.categoryIds.join(',') }),
    ...(filters.q && { q: filters.q }),
  };
}

/** The URL parameters after applying some changes to the filters. */
function writeFilters(
  params: URLSearchParams,
  changes: Partial<Filters>,
  defaultPreset: Preset,
): URLSearchParams {
  // Writing starts from the current names, so a bookmarked Spanish URL comes
  // out of its first change with only the English parameters.
  const next = withCurrentNames(params);

  if (changes.preset !== undefined) {
    if (changes.preset === defaultPreset) next.delete('range');
    else next.set('range', changes.preset);

    // Switching presets discards the dates typed by hand: keeping them would make
    // the range shown not be the one of the button that is on.
    if (changes.preset !== 'custom') {
      next.delete('from');
      next.delete('to');
    }
  }

  // Typing a date by hand implies switching to custom, or the range would be
  // recomputed from the preset and the change would be lost instantly.
  if (changes.from !== undefined) {
    next.set('from', changes.from);
    next.set('range', 'custom');
  }
  if (changes.to !== undefined) {
    next.set('to', changes.to);
    next.set('range', 'custom');
  }

  if (changes.categoryIds !== undefined) {
    if (changes.categoryIds.length === 0) next.delete('categories');
    else next.set('categories', changes.categoryIds.join(','));
  }
  if (changes.q !== undefined) {
    if (changes.q.trim() === '') next.delete('q');
    else next.set('q', changes.q);
  }

  return next;
}

/*
  The Spanish names the filters had in the URL until 7.2-r1, and what each one
  is called now. They are still READ because there are bookmarks and pasted
  links with them; they are never written. They go in the contraction (plan 8.7).

  Pairs and not an object on purpose: as keys they would be new Spanish
  declarations for `lint:spanish`, and they are data, not names.
*/
const LEGACY_PARAMS: readonly (readonly [string, string])[] = [
  ['rango', 'range'],
  ['desde', 'from'],
  ['hasta', 'to'],
  ['categorias', 'categories'],
  ['busca', 'q'],
];

const LEGACY_PRESETS: ReadonlyMap<string, Preset> = new Map<string, Preset>([
  ['todo', 'all'],
  ['mes-actual', 'this-month'],
  ['mes-pasado', 'last-month'],
  ['trimestre', 'last-3-months'],
  ['anio-actual', 'this-year'],
  ['anio-pasado', 'last-year'],
  ['personalizado', 'custom'],
]);

const KNOWN_PRESETS = new Set<string>(PRESETS.map((p) => p.value));

/** A `range` value as a preset: the current one, the legacy one translated, or nothing. */
function presetOf(value: string | null): Preset | undefined {
  if (value === null) return undefined;
  if (KNOWN_PRESETS.has(value)) return value as Preset;
  return LEGACY_PRESETS.get(value);
}

/**
 * The parameters with every legacy filter name moved to its current one.
 *
 * When both are present the current one wins: it is the one this app wrote.
 * Parameters that are not filters are left as they are.
 */
function withCurrentNames(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params);

  for (const [legacy, current] of LEGACY_PARAMS) {
    const value = next.get(legacy);
    if (value === null) continue;
    next.delete(legacy);
    if (!next.has(current)) next.set(current, value);
  }

  const range = next.get('range');
  if (range !== null) {
    const preset = presetOf(range);
    if (preset !== undefined) next.set('range', preset);
  }

  return next;
}
