import { isDueInMonth, dueDate } from './pending';
import type { Periodicity } from '../../generated/prisma/client';

/*
  Phase 6.2: bimonthly, quarterly and semiannual had never been used in
  production and had only a handful of spot checks. These tests walk whole
  years, so a wrong modulo or an off-by-one in the reference month shows up as
  a wrong list of months instead of passing by luck on the one month checked.
*/

/** Every month of `year` as `YYYY-MM-01`. */
function monthsOf(year: number): string[] {
  return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}-01`);
}

/** The month numbers (1–12) of `year` in which the concept is due. */
function dueMonths(
  periodicity: Periodicity,
  referenceMonth: number | null,
  year: number,
): number[] {
  return monthsOf(year)
    .filter((month) => isDueInMonth(periodicity, referenceMonth, month))
    .map((month) => Number(month.slice(5, 7)));
}

/** The due dates in `year`, as `dueMonths` + `dueDate` compose them in the dashboard. */
function dueDates(
  periodicity: Periodicity,
  referenceMonth: number,
  paymentDay: number | null,
  year: number,
): string[] {
  return monthsOf(year)
    .filter((month) => isDueInMonth(periodicity, referenceMonth, month))
    .map((month) => dueDate(month, paymentDay));
}

describe('Intermediate periodicities', () => {
  describe('bimonthly', () => {
    it('is due every other month starting at the reference month', () => {
      expect(dueMonths('bimonthly', 1, 2026)).toEqual([1, 3, 5, 7, 9, 11]);
      expect(dueMonths('bimonthly', 2, 2026)).toEqual([2, 4, 6, 8, 10, 12]);
    });

    it('lands on the same parity for any reference month of that parity', () => {
      // A reference in November describes the same cycle as one in January.
      expect(dueMonths('bimonthly', 11, 2026)).toEqual(dueMonths('bimonthly', 1, 2026));
      expect(dueMonths('bimonthly', 12, 2026)).toEqual(dueMonths('bimonthly', 2, 2026));
    });

    it('keeps the cycle across the year boundary', () => {
      expect(isDueInMonth('bimonthly', 12, '2026-12-01')).toBe(true);
      expect(isDueInMonth('bimonthly', 12, '2027-01-01')).toBe(false);
      expect(isDueInMonth('bimonthly', 12, '2027-02-01')).toBe(true);
    });
  });

  describe('quarterly', () => {
    it.each([
      [1, [1, 4, 7, 10]],
      [2, [2, 5, 8, 11]],
      [3, [3, 6, 9, 12]],
      [12, [3, 6, 9, 12]],
    ])('with reference month %i is due in %j', (reference, expected) => {
      expect(dueMonths('quarterly', reference, 2026)).toEqual(expected);
    });

    it('keeps the cycle across the year boundary', () => {
      expect(isDueInMonth('quarterly', 11, '2026-11-01')).toBe(true);
      expect(isDueInMonth('quarterly', 11, '2027-02-01')).toBe(true);
      expect(isDueInMonth('quarterly', 11, '2027-01-01')).toBe(false);
    });
  });

  describe('semiannual', () => {
    it.each([
      [1, [1, 7]],
      [6, [6, 12]],
      [8, [2, 8]],
      [12, [6, 12]],
    ])('with reference month %i is due in %j', (reference, expected) => {
      expect(dueMonths('semiannual', reference, 2026)).toEqual(expected);
    });

    it('is the same months every year', () => {
      for (const year of [2020, 2026, 2031]) {
        expect(dueMonths('semiannual', 8, year)).toEqual([2, 8]);
      }
    });
  });

  describe('without a reference month (paymentMonth is null)', () => {
    it.each<Periodicity>(['bimonthly', 'quarterly', 'semiannual'])(
      '%s is treated as due every month rather than hidden',
      (periodicity) => {
        expect(dueMonths(periodicity, null, 2026)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
      },
    );
  });

  describe('due date in short months', () => {
    it('bimonthly on the 31st falls on the last day of each due month', () => {
      expect(dueDates('bimonthly', 2, 31, 2026)).toEqual([
        '2026-02-28',
        '2026-04-30',
        '2026-06-30',
        '2026-08-31',
        '2026-10-31',
        '2026-12-31',
      ]);
    });

    it('February of a leap year keeps the 29th', () => {
      expect(dueDates('bimonthly', 2, 31, 2028)[0]).toBe('2028-02-29');
      expect(dueDates('semiannual', 8, 30, 2028)).toEqual(['2028-02-29', '2028-08-30']);
    });

    it('quarterly on the 31st clips in the 30-day months', () => {
      expect(dueDates('quarterly', 3, 31, 2026)).toEqual([
        '2026-03-31',
        '2026-06-30',
        '2026-09-30',
        '2026-12-31',
      ]);
    });

    it('a day that exists in every month is never moved', () => {
      expect(dueDates('semiannual', 2, 28, 2026)).toEqual(['2026-02-28', '2026-08-28']);
      expect(dueDates('quarterly', 1, 15, 2026)).toEqual([
        '2026-01-15',
        '2026-04-15',
        '2026-07-15',
        '2026-10-15',
      ]);
    });

    it('without a payment day it is due on the last day of the month', () => {
      expect(dueDates('semiannual', 8, null, 2026)).toEqual(['2026-02-28', '2026-08-31']);
    });
  });
});
