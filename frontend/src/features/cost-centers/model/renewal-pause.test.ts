import { describe, expect, it } from 'vitest';

import {
  nextMonth,
  previousMonth,
  renewalState,
  suggestedMonth,
  yearOptions,
} from './renewal-pause';

const pause = (fromMonth: string, resumeMonth: string | null, id = 1) => ({
  id,
  categoryId: 7,
  fromMonth,
  resumeMonth,
});

describe('renewalState', () => {
  it('is active without pauses, or when every period is over', () => {
    expect(renewalState([], '2026-10')).toEqual({ kind: 'active' });
    expect(renewalState([pause('2026-01', '2026-03')], '2026-10')).toEqual({ kind: 'active' });
  });

  it('is paused from an open period that already started, and scheduled when it starts later', () => {
    expect(renewalState([pause('2026-10', null)], '2026-10')).toEqual({
      kind: 'paused',
      from: '2026-10',
    });
    expect(renewalState([pause('2027-01', null)], '2026-10')).toEqual({
      kind: 'scheduled',
      from: '2027-01',
    });
  });

  it('says when a closed period running today ends', () => {
    expect(renewalState([pause('2026-10', '2026-12')], '2026-11')).toEqual({
      kind: 'resuming',
      resume: '2026-12',
    });
    // The resume month is already active.
    expect(renewalState([pause('2026-10', '2026-12')], '2026-12')).toEqual({ kind: 'active' });
  });
});

describe('months', () => {
  it('step back and forth across the year', () => {
    expect(previousMonth('2027-01')).toBe('2026-12');
    expect(nextMonth('2026-12')).toBe('2027-01');
  });

  it('a resume question starts after the pause began, and never before today', () => {
    expect(suggestedMonth('2026-10')).toBe('2026-10');
    expect(suggestedMonth('2026-10', '2026-08')).toBe('2026-10');
    expect(suggestedMonth('2026-10', '2027-01')).toBe('2027-02');
  });

  it('offers five years each side of today, plus the chosen one', () => {
    expect(yearOptions('2026-10', '2026-10')).toEqual([
      '2021',
      '2022',
      '2023',
      '2024',
      '2025',
      '2026',
      '2027',
      '2028',
      '2029',
      '2030',
      '2031',
    ]);
    expect(yearOptions('2026-10', '2040-01').at(-1)).toBe('2040');
  });
});
