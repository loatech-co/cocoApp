import { describe, expect, it } from 'vitest';

import { findDate } from './read-date';

const YEAR = 2026;

describe('Reading dates', () => {
  it('reads the ISO format, which is unmistakable', () => {
    expect(findDate('2026-08-01 EXITO', YEAR)?.iso).toBe('2026-08-01');
  });

  // ── The ambiguity that has to be resolved right ──
  it('01/08 is August 1, not January 8', () => {
    // In Colombia the order is DAY/MONTH. Reading it the other way round would
    // shift half a statement to another month without anything giving it away.
    expect(findDate('01/08/2026 EXITO', YEAR)?.iso).toBe('2026-08-01');
    expect(findDate('13/08/2026 EXITO', YEAR)?.iso).toBe('2026-08-13');
  });

  it('accepts dashes and dots as separators', () => {
    expect(findDate('01-08-2026 EXITO', YEAR)?.iso).toBe('2026-08-01');
    expect(findDate('01.08.2026 EXITO', YEAR)?.iso).toBe('2026-08-01');
  });

  it('completes a two-digit year', () => {
    expect(findDate('01/08/26 EXITO', YEAR)?.iso).toBe('2026-08-01');
    expect(findDate('01/08/99 EXITO', YEAR)?.iso).toBe('1999-08-01');
  });

  it("uses the header's year when the line does not carry one", () => {
    // It is the most common case: a monthly statement writes "01/08" because
    // the year is already above. Without this it would be fixed line by line.
    expect(findDate('01/08 EXITO POBLADO', YEAR)?.iso).toBe('2026-08-01');
  });

  describe('months written out in letters', () => {
    it.each([
      ['01 AGO', '2026-08-01'],
      ['1 de agosto', '2026-08-01'],
      ['AGO 01', '2026-08-01'],
      ['15 DIC', '2026-12-15'],
      ['3 de septiembre', '2026-09-03'],
      ['05 ENE 2025', '2025-01-05'],
    ])('reads %p', (input, expected) => {
      expect(findDate(`${input} EXITO POBLADO`, YEAR)?.iso).toBe(expected);
    });

    it('tolerates accents', () => {
      expect(findDate('01 MARZO', YEAR)?.iso).toBe('2026-03-01');
    });
  });

  it('rejects a date that does not exist', () => {
    // 31/02 would turn into March 3 when saved: the kind of silent error that
    // unbalances a statement without anyone knowing why.
    expect(findDate('31/02/2026 EXITO', YEAR)).toBeNull();
    expect(findDate('32/01/2026 EXITO', YEAR)).toBeNull();
    expect(findDate('01/13/2026 EXITO', YEAR)).toBeNull();
  });

  it('returns null when there is no date', () => {
    expect(findDate('MOVIMIENTOS DEL MES', YEAR)).toBeNull();
    expect(findDate('', YEAR)).toBeNull();
  });

  it('marks where it was, so the description can be trimmed', () => {
    const line = '01/08/2026 EXITO POBLADO 45.900';
    const date = findDate(line, YEAR)!;
    expect(line.slice(date.end).trim()).toBe('EXITO POBLADO 45.900');
  });
});
