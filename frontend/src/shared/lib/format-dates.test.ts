import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  WEEKDAYS,
  shortDay,
  longDay,
  SHORT_MONTHS,
  LONG_MONTHS,
  shortMonth,
  longMonth,
  longRange,
  todayInBogota,
} from './format';

/**
 * The names now come from `Intl` (es-CO) instead of four hand-written lists.
 * These are the lists and the shapes the screens printed before (step 7.3):
 * if a browser's `Intl` ever says it differently, this is where it shows.
 */
describe('dates, written the way Coco writes them', () => {
  it('names the months and the weekdays as the hand-written lists did', () => {
    expect(LONG_MONTHS.join(' ')).toBe(
      'enero febrero marzo abril mayo junio julio agosto septiembre octubre noviembre diciembre',
    );
    expect(SHORT_MONTHS.join(' ')).toBe('ene feb mar abr may jun jul ago sep oct nov dic');
    expect(WEEKDAYS.join(' ')).toBe('lu ma mi ju vi sá do');
  });

  it('writes a day long and short', () => {
    expect(longDay('2026-09-06')).toBe('6 de septiembre de 2026');
    expect(shortDay('2026-03-06')).toBe('6 mar 2026');
  });

  it('writes a month long and short', () => {
    expect(longMonth('2026-09')).toBe('Septiembre de 2026');
    expect(longMonth('2026-09-01')).toBe('Septiembre de 2026');
    expect(shortMonth('2026-03-01')).toBe('mar 2026');
  });

  it('writes a range without repeating what both ends share', () => {
    expect(longRange('2026-09-06', '2026-09-15')).toBe('6 — 15 de septiembre de 2026');
    expect(longRange('2026-08-06', '2026-09-15')).toBe('6 de agosto — 15 de septiembre de 2026');
    expect(longRange('2025-12-06', '2026-01-15')).toBe(
      '6 de diciembre de 2025 — 15 de enero de 2026',
    );
  });

  it('gives back what it cannot read instead of throwing', () => {
    expect(longDay('no-es-fecha')).toBe('no-es-fecha');
    expect(longMonth('2026-13')).toBe('2026-13');
  });
});

describe('todayInBogota()', () => {
  afterEach(() => vi.useRealTimers());

  it('is still yesterday late in the Bogotá evening, when UTC already turned', () => {
    vi.useFakeTimers();
    // 02:30 UTC on the 15th is 21:30 on the 14th in Bogotá.
    vi.setSystemTime(new Date('2026-03-15T02:30:00Z'));
    expect(todayInBogota()).toBe('2026-03-14');
  });

  it('turns the day at midnight in Bogotá, not at midnight UTC', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-15T05:00:00Z'));
    expect(todayInBogota()).toBe('2026-03-15');
  });
});
