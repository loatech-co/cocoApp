import { afterEach, describe, expect, it, vi } from 'vitest';

import { rangeOf } from './filters';

/**
 * Ranges are computed in America/Bogota (UTC−5). The clock is pinned so that
 * the tests do not change result depending on the day they run nor on the
 * time zone of whoever runs them.
 */
function freeze(iso: string): void {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(iso));
}

afterEach(() => vi.useRealTimers());

describe('Time ranges', () => {
  it('the current month reaches UP TO TODAY, not the end of the month', () => {
    freeze('2025-03-14T15:00:00Z');
    // Including days that have not happened would flatten any average.
    expect(rangeOf('mes-actual')).toEqual({ from: '2025-03-01', to: '2025-03-14' });
  });

  it('last month is the WHOLE previous month', () => {
    freeze('2025-03-14T15:00:00Z');
    expect(rangeOf('mes-pasado')).toEqual({ from: '2025-02-01', to: '2025-02-28' });
  });

  it('last month respects leap years', () => {
    freeze('2024-03-10T15:00:00Z');
    expect(rangeOf('mes-pasado')).toEqual({ from: '2024-02-01', to: '2024-02-29' });
  });

  it('the last 3 months count back from today, not the calendar quarter', () => {
    freeze('2025-04-02T15:00:00Z');
    // On April 2 you want to see from February, not just the two days of April.
    expect(rangeOf('trimestre')).toEqual({ from: '2025-02-01', to: '2025-04-02' });
  });

  it('the current year goes from January 1 to today', () => {
    freeze('2025-07-09T15:00:00Z');
    expect(rangeOf('anio-actual')).toEqual({ from: '2025-01-01', to: '2025-07-09' });
  });

  it('last year is the whole previous year', () => {
    freeze('2025-07-09T15:00:00Z');
    expect(rangeOf('anio-pasado')).toEqual({ from: '2024-01-01', to: '2024-12-31' });
  });

  it('crosses the year end backwards correctly', () => {
    freeze('2025-01-15T15:00:00Z');
    expect(rangeOf('mes-pasado')).toEqual({ from: '2024-12-01', to: '2024-12-31' });
    expect(rangeOf('trimestre')).toEqual({ from: '2024-11-01', to: '2025-01-15' });
  });

  it('early in the day in Bogotá it is still the previous day in UTC', () => {
    // 03:00 UTC on the 15th is 22:00 on the 14th in Bogotá: the range has to
    // end on the 14th, or the app would show a day that has not started there.
    freeze('2025-03-15T03:00:00Z');
    expect(rangeOf('mes-actual').to).toBe('2025-03-14');
  });
});
