import {
  chargeFingerprint,
  chargeFingerprintPrefix,
  isConceptDueInMonth,
  isPausedIn,
  monthOfFingerprint,
  periodsOverlap,
  type DueRule,
} from './recurrence';

/** Every month of `year` as `YYYY-MM`. */
const monthsOf = (year: number): string[] =>
  Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);

const dueIn = (rule: DueRule, months: string[]): string[] =>
  months.filter((month) => isConceptDueInMonth(rule, month));

describe('isConceptDueInMonth', () => {
  it('follows the owner’s example: active Jan–Sep, paused in October, active again from December', () => {
    const rule: DueRule = {
      periodicity: 'monthly',
      paymentMonth: null,
      pauses: [{ fromMonth: '2026-10', resumeMonth: '2026-12' }],
    };

    expect(dueIn(rule, monthsOf(2026))).toEqual([
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-12',
    ]);
    // And it keeps renewing after December while active.
    expect(dueIn(rule, monthsOf(2027))).toEqual(monthsOf(2027));
  });

  it('an open pause covers its month and every month after it', () => {
    const rule: DueRule = {
      periodicity: 'monthly',
      paymentMonth: null,
      pauses: [{ fromMonth: '2027-01', resumeMonth: null }],
    };

    expect(isConceptDueInMonth(rule, '2026-12')).toBe(true);
    expect(isConceptDueInMonth(rule, '2027-01')).toBe(false);
    expect(isConceptDueInMonth(rule, '2035-06')).toBe(false);
  });

  it('reads a full date by its month', () => {
    const rule: DueRule = {
      periodicity: 'monthly',
      paymentMonth: null,
      pauses: [{ fromMonth: '2026-10', resumeMonth: '2026-11' }],
    };

    expect(isConceptDueInMonth(rule, '2026-10-01')).toBe(false);
    expect(isConceptDueInMonth(rule, '2026-11-01')).toBe(true);
  });

  it('removes only the due months a pause covers, without moving the cycle', () => {
    // Quarterly from March: March, June, September, December.
    const rule: DueRule = {
      periodicity: 'quarterly',
      paymentMonth: 3,
      pauses: [{ fromMonth: '2026-05', resumeMonth: '2026-10' }],
    };

    expect(dueIn(rule, monthsOf(2026))).toEqual(['2026-03', '2026-12']);
  });

  it('takes several periods of history', () => {
    const rule: DueRule = {
      periodicity: 'monthly',
      paymentMonth: null,
      pauses: [
        { fromMonth: '2026-02', resumeMonth: '2026-03' },
        { fromMonth: '2026-07', resumeMonth: '2026-09' },
      ],
    };

    expect(dueIn(rule, monthsOf(2026))).toEqual([
      '2026-01',
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-09',
      '2026-10',
      '2026-11',
      '2026-12',
    ]);
  });

  it('without pauses it is the cycle alone', () => {
    const rule: DueRule = { periodicity: 'annual', paymentMonth: 9, pauses: [] };
    expect(dueIn(rule, monthsOf(2026))).toEqual(['2026-09']);
  });
});

describe('isPausedIn', () => {
  it('the resume month is no longer paused', () => {
    const pauses = [{ fromMonth: '2026-10', resumeMonth: '2026-12' }];
    expect(isPausedIn(pauses, '2026-09')).toBe(false);
    expect(isPausedIn(pauses, '2026-10')).toBe(true);
    expect(isPausedIn(pauses, '2026-11')).toBe(true);
    expect(isPausedIn(pauses, '2026-12')).toBe(false);
  });
});

describe('periodsOverlap', () => {
  it('two periods that share a month overlap', () => {
    expect(
      periodsOverlap(
        { fromMonth: '2026-10', resumeMonth: '2026-12' },
        { fromMonth: '2026-11', resumeMonth: '2027-02' },
      ),
    ).toBe(true);
  });

  it('a period that starts on the other’s resume month does not', () => {
    expect(
      periodsOverlap(
        { fromMonth: '2026-10', resumeMonth: '2026-12' },
        { fromMonth: '2026-12', resumeMonth: null },
      ),
    ).toBe(false);
  });

  it('an open period overlaps anything that ends after it starts', () => {
    expect(
      periodsOverlap(
        { fromMonth: '2027-01', resumeMonth: null },
        { fromMonth: '2026-06', resumeMonth: '2027-02' },
      ),
    ).toBe(true);
    expect(
      periodsOverlap(
        { fromMonth: '2027-01', resumeMonth: null },
        { fromMonth: '2026-06', resumeMonth: '2027-01' },
      ),
    ).toBe(false);
    expect(
      periodsOverlap(
        { fromMonth: '2027-01', resumeMonth: null },
        { fromMonth: '2028-01', resumeMonth: null },
      ),
    ).toBe(true);
  });
});

describe('charge fingerprints', () => {
  it('start with the concept’s prefix and carry the month', () => {
    const fingerprint = chargeFingerprint(7n, '2026-10-01');
    expect(fingerprint.startsWith(chargeFingerprintPrefix(7n))).toBe(true);
    expect(monthOfFingerprint(fingerprint)).toBe('2026-10');
  });

  it('the prefix of one concept is not a prefix of another', () => {
    expect(chargeFingerprint(17n, '2026-10').startsWith(chargeFingerprintPrefix(1n))).toBe(false);
  });
});
