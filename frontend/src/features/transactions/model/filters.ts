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
  | 'todo'
  | 'mes-actual'
  | 'mes-pasado'
  | 'trimestre'
  | 'anio-actual'
  | 'anio-pasado'
  | 'personalizado';

export const PRESETS: { value: Preset; label: string; help: string }[] = [
  {
    value: 'todo',
    label: t('transactions.range.presets.all'),
    help: t('transactions.range.presets.allHelp'),
  },
  {
    value: 'mes-actual',
    label: t('transactions.range.presets.thisMonth'),
    help: t('transactions.range.presets.thisMonthHelp'),
  },
  {
    value: 'mes-pasado',
    label: t('transactions.range.presets.lastMonth'),
    help: t('transactions.range.presets.lastMonthHelp'),
  },
  {
    value: 'trimestre',
    label: t('transactions.range.presets.last3Months'),
    help: t('transactions.range.presets.last3MonthsHelp'),
  },
  {
    value: 'anio-actual',
    label: t('transactions.range.presets.thisYear'),
    help: t('transactions.range.presets.thisYearHelp'),
  },
  {
    value: 'anio-pasado',
    label: t('transactions.range.presets.lastYear'),
    help: t('transactions.range.presets.lastYearHelp'),
  },
  {
    value: 'personalizado',
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
    case 'todo':
      // It starts at the FIRST transaction, not in 1970: with 1970 the chart
      // stretched its axis over half an empty century to draw four years of
      // data, and the date button promised a period that never existed.
      return {
        from: history?.first ?? '1970-01-01',
        to: history?.last ?? aISO(utc(a + 5, 11, 31)),
      };

    case 'mes-actual':
      // UP TO TODAY, not to the end of the month: including days that have not happened
      // would flatten any average and make it look like less was spent.
      return { from: aISO(utc(a, m, 1)), to: aISO(utc(a, m, d)) };

    case 'mes-pasado':
      return { from: aISO(utc(a, m - 1, 1)), to: aISO(utc(a, m, 0)) };

    case 'trimestre':
      // Three months back from today, not "the calendar quarter": on April
      // 2 you want to see January–April, not just the two days of April.
      return { from: aISO(utc(a, m - 2, 1)), to: aISO(utc(a, m, d)) };

    case 'anio-actual':
      return { from: aISO(utc(a, 0, 1)), to: aISO(utc(a, m, d)) };

    case 'anio-pasado':
      return { from: aISO(utc(a - 1, 0, 1)), to: aISO(utc(a - 1, 11, 31)) };

    case 'personalizado':
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
export function useFilters(defaultPreset: Preset = 'mes-actual'): {
  filters: Filters;
  apply: (changes: Partial<Filters>) => void;
  clear: () => void;
  hasActiveFilters: boolean;
} {
  const [params, setParams] = useSearchParams();
  const history = useHistory();

  const filters = useMemo<Filters>(() => {
    const preset = (params.get('rango') as Preset | null) ?? defaultPreset;
    const range = rangeOf(preset, history.data);

    return {
      preset,
      from: preset === 'personalizado' ? (params.get('desde') ?? range.from) : range.from,
      to: preset === 'personalizado' ? (params.get('hasta') ?? range.to) : range.to,
      categoryIds: (params.get('categorias') ?? '')
        .split(',')
        .map((n) => Number(n))
        .filter((n) => Number.isInteger(n) && n > 0),
      q: params.get('busca') ?? undefined,
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
  const next = new URLSearchParams(params);

  if (changes.preset !== undefined) {
    if (changes.preset === defaultPreset) next.delete('rango');
    else next.set('rango', changes.preset);

    // Switching presets discards the dates typed by hand: keeping them would make
    // the range shown not be the one of the button that is on.
    if (changes.preset !== 'personalizado') {
      next.delete('desde');
      next.delete('hasta');
    }
  }

  // Typing a date by hand implies switching to custom, or the range would be
  // recomputed from the preset and the change would be lost instantly.
  if (changes.from !== undefined) {
    next.set('desde', changes.from);
    next.set('rango', 'personalizado');
  }
  if (changes.to !== undefined) {
    next.set('hasta', changes.to);
    next.set('rango', 'personalizado');
  }

  if (changes.categoryIds !== undefined) {
    if (changes.categoryIds.length === 0) next.delete('categorias');
    else next.set('categorias', changes.categoryIds.join(','));
  }
  if (changes.q !== undefined) {
    if (changes.q.trim() === '') next.delete('busca');
    else next.set('busca', changes.q);
  }

  return next;
}
