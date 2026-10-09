import { describe, expect, it } from 'vitest';

import {
  checkRetirement,
  FLAG_NAMES,
  FLAGS,
  flagOfPreferenceKey,
  type FlagDefinition,
  parseFeatures,
  preferenceKey,
} from './index';

const flag = (removeBy: string): FlagDefinition =>
  ({ description: 'test', owner: 'tests', removeBy }) as FlagDefinition;

describe('registry', () => {
  it('names are snake_case, so they fit FEATURES=a,b and feature:<name>', () => {
    for (const name of FLAG_NAMES) expect(name).toMatch(/^[a-z][a-z0-9_]*$/);
  });

  it('every flag has a description, an owner and a real removeBy date', () => {
    for (const definition of Object.values(FLAGS)) {
      expect(definition.description.length).toBeGreaterThan(0);
      expect(definition.owner.length).toBeGreaterThan(0);
    }
    expect(checkRetirement(FLAGS, '2000-01-01').failures).toEqual([]);
  });

  it('a flag outside the registry does not compile', () => {
    // @ts-expect-error — not a registered flag
    preferenceKey('not_a_flag');
  });
});

describe('parseFeatures', () => {
  it('reads a comma list, trims it and ignores empty entries', () => {
    expect(parseFeatures(' flags_canary , ,')).toEqual({ names: ['flags_canary'], unknown: [] });
  });

  it('nothing set means no server flags', () => {
    expect(parseFeatures(undefined)).toEqual({ names: [], unknown: [] });
    expect(parseFeatures('')).toEqual({ names: [], unknown: [] });
  });

  it('returns unknown names instead of dropping them', () => {
    expect(parseFeatures('flags_canary,flags_canry').unknown).toEqual(['flags_canry']);
  });

  it('a repeated name counts once', () => {
    expect(parseFeatures('flags_canary,flags_canary').names).toEqual(['flags_canary']);
  });
});

describe('preference keys', () => {
  it('round-trips a registered flag', () => {
    expect(flagOfPreferenceKey(preferenceKey('flags_canary'))).toBe('flags_canary');
  });

  it('ignores other preferences and unknown flags', () => {
    expect(flagOfPreferenceKey('accounts_enabled')).toBeNull();
    expect(flagOfPreferenceKey('feature:gone')).toBeNull();
  });
});

describe('checkRetirement', () => {
  const flags = { a: flag('2026-10-01') };

  it('says nothing on or before removeBy', () => {
    expect(checkRetirement(flags, '2026-09-01')).toEqual({ warnings: [], failures: [] });
    expect(checkRetirement(flags, '2026-10-01')).toEqual({ warnings: [], failures: [] });
  });

  it('warns once removeBy has passed, for up to 30 days', () => {
    expect(checkRetirement(flags, '2026-10-02').warnings).toHaveLength(1);
    const lastDay = checkRetirement(flags, '2026-10-31');
    expect(lastDay.warnings).toHaveLength(1);
    expect(lastDay.failures).toEqual([]);
  });

  it('fails past the 30-day grace period', () => {
    const report = checkRetirement(flags, '2026-11-01');
    expect(report.warnings).toEqual([]);
    expect(report.failures).toEqual([expect.stringContaining('a: 31 day(s) past')]);
  });

  it('fails on a removeBy that is not a real date', () => {
    expect(checkRetirement({ a: flag('2027-02-30') }, '2026-01-01').failures).toHaveLength(1);
    expect(checkRetirement({ a: flag('soon') }, '2026-01-01').failures).toHaveLength(1);
  });

  it('refuses a malformed today', () => {
    expect(() => checkRetirement(flags, '01/10/2026')).toThrow();
  });
});
