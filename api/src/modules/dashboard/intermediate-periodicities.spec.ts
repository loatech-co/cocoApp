import type { Periodicidad } from '@prisma/client';

import { tocaEnElMes, vencimiento } from './pendientes';

/*
  Phase 6.2: bimestral, trimestral and semestral had never been used in
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
  periodicity: Periodicidad,
  referenceMonth: number | null,
  year: number,
): number[] {
  return monthsOf(year)
    .filter((month) => tocaEnElMes(periodicity, referenceMonth, month))
    .map((month) => Number(month.slice(5, 7)));
}

/** The due dates in `year`, as `dueMonths` + `vencimiento` compose them in the dashboard. */
function dueDates(
  periodicity: Periodicidad,
  referenceMonth: number,
  paymentDay: number | null,
  year: number,
): string[] {
  return monthsOf(year)
    .filter((month) => tocaEnElMes(periodicity, referenceMonth, month))
    .map((month) => vencimiento(month, paymentDay));
}

describe('Intermediate periodicities', () => {
  describe('bimestral', () => {
    it('is due every other month starting at the reference month', () => {
      expect(dueMonths('bimestral', 1, 2026)).toEqual([1, 3, 5, 7, 9, 11]);
      expect(dueMonths('bimestral', 2, 2026)).toEqual([2, 4, 6, 8, 10, 12]);
    });

    it('lands on the same parity for any reference month of that parity', () => {
      // A reference in November describes the same cycle as one in January.
      expect(dueMonths('bimestral', 11, 2026)).toEqual(dueMonths('bimestral', 1, 2026));
      expect(dueMonths('bimestral', 12, 2026)).toEqual(dueMonths('bimestral', 2, 2026));
    });

    it('keeps the cycle across the year boundary', () => {
      expect(tocaEnElMes('bimestral', 12, '2026-12-01')).toBe(true);
      expect(tocaEnElMes('bimestral', 12, '2027-01-01')).toBe(false);
      expect(tocaEnElMes('bimestral', 12, '2027-02-01')).toBe(true);
    });
  });

  describe('trimestral', () => {
    it.each([
      [1, [1, 4, 7, 10]],
      [2, [2, 5, 8, 11]],
      [3, [3, 6, 9, 12]],
      [12, [3, 6, 9, 12]],
    ])('with reference month %i is due in %j', (reference, expected) => {
      expect(dueMonths('trimestral', reference, 2026)).toEqual(expected);
    });

    it('keeps the cycle across the year boundary', () => {
      expect(tocaEnElMes('trimestral', 11, '2026-11-01')).toBe(true);
      expect(tocaEnElMes('trimestral', 11, '2027-02-01')).toBe(true);
      expect(tocaEnElMes('trimestral', 11, '2027-01-01')).toBe(false);
    });
  });

  describe('semestral', () => {
    it.each([
      [1, [1, 7]],
      [6, [6, 12]],
      [8, [2, 8]],
      [12, [6, 12]],
    ])('with reference month %i is due in %j', (reference, expected) => {
      expect(dueMonths('semestral', reference, 2026)).toEqual(expected);
    });

    it('is the same months every year', () => {
      for (const year of [2020, 2026, 2031]) {
        expect(dueMonths('semestral', 8, year)).toEqual([2, 8]);
      }
    });
  });

  describe('without a reference month (mes_de_pago is null)', () => {
    it.each<Periodicidad>(['bimestral', 'trimestral', 'semestral'])(
      '%s is treated as due every month rather than hidden',
      (periodicity) => {
        expect(dueMonths(periodicity, null, 2026)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
      },
    );
  });

  describe('due date in short months', () => {
    it('bimestral on the 31st falls on the last day of each due month', () => {
      expect(dueDates('bimestral', 2, 31, 2026)).toEqual([
        '2026-02-28',
        '2026-04-30',
        '2026-06-30',
        '2026-08-31',
        '2026-10-31',
        '2026-12-31',
      ]);
    });

    it('February of a leap year keeps the 29th', () => {
      expect(dueDates('bimestral', 2, 31, 2028)[0]).toBe('2028-02-29');
      expect(dueDates('semestral', 8, 30, 2028)).toEqual(['2028-02-29', '2028-08-30']);
    });

    it('trimestral on the 31st clips in the 30-day months', () => {
      expect(dueDates('trimestral', 3, 31, 2026)).toEqual([
        '2026-03-31',
        '2026-06-30',
        '2026-09-30',
        '2026-12-31',
      ]);
    });

    it('a day that exists in every month is never moved', () => {
      expect(dueDates('semestral', 2, 28, 2026)).toEqual(['2026-02-28', '2026-08-28']);
      expect(dueDates('trimestral', 1, 15, 2026)).toEqual([
        '2026-01-15',
        '2026-04-15',
        '2026-07-15',
        '2026-10-15',
      ]);
    });

    it('without a payment day it is due on the last day of the month', () => {
      expect(dueDates('semestral', 8, null, 2026)).toEqual(['2026-02-28', '2026-08-31']);
    });
  });
});
