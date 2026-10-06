import {
  pendingOutcome,
  expectedForMonth,
  chargeFingerprint,
  isAutoChargeDue,
  estimateForMonth,
  absoluteMonth,
  previousMonths,
  isDueInMonth,
  dueDate,
} from './pending';
import { toMoney } from '../../common/money/money';

describe('Pending payments', () => {
  describe('Whether it is due in the month', () => {
    it('monthly is due every month, whatever the reference', () => {
      expect(isDueInMonth('monthly', null, '2026-09-01')).toBe(true);
      expect(isDueInMonth('monthly', 3, '2026-09-01')).toBe(true);
    });

    it('quarterly falls in its month and every three from there', () => {
      // With the reference in March: June, September, December.
      for (const month of ['2026-03-01', '2026-06-01', '2026-09-01', '2026-12-01']) {
        expect(isDueInMonth('quarterly', 3, month)).toBe(true);
      }
      for (const month of ['2026-04-01', '2026-05-01', '2026-07-01']) {
        expect(isDueInMonth('quarterly', 3, month)).toBe(false);
      }
    });

    it('two quarterlies with different references fall in different months', () => {
      // Exactly what a bare "every three months" cannot express.
      expect(isDueInMonth('quarterly', 1, '2026-04-01')).toBe(true);
      expect(isDueInMonth('quarterly', 2, '2026-04-01')).toBe(false);
    });

    it('annual falls only in its month', () => {
      expect(isDueInMonth('annual', 9, '2026-09-01')).toBe(true);
      expect(isDueInMonth('annual', 9, '2027-09-01')).toBe(true);
      expect(isDueInMonth('annual', 9, '2026-03-01')).toBe(false);
    });

    it('semiannual, twice a year', () => {
      expect(isDueInMonth('semiannual', 2, '2026-02-01')).toBe(true);
      expect(isDueInMonth('semiannual', 2, '2026-08-01')).toBe(true);
      expect(isDueInMonth('semiannual', 2, '2026-05-01')).toBe(false);
    });

    it('works BACKWARDS from the reference month', () => {
      // The cycle does not start to exist the day it was set up: February 2020
      // was also an even month if the reference is February.
      expect(isDueInMonth('bimonthly', 2, '2020-02-01')).toBe(true);
      expect(isDueInMonth('bimonthly', 2, '2020-03-01')).toBe(false);
    });

    it('without a reference it is assumed due', () => {
      // Someone marked it recurring and there is no record: keeping quiet would
      // hide exactly what they want to see.
      expect(isDueInMonth('annual', null, '2026-09-01')).toBe(true);
    });
  });

  describe('The due day', () => {
    it('is the payment day of the concept', () => {
      expect(dueDate('2026-09-01', 15)).toBe('2026-09-15');
    });

    it('in short months it is clipped to the last day', () => {
      // Whoever pays on the 31st does not stop paying in February: they pay on the 28th.
      expect(dueDate('2026-02-01', 31)).toBe('2026-02-28');
      expect(dueDate('2024-02-01', 31)).toBe('2024-02-29');
      expect(dueDate('2026-04-01', 31)).toBe('2026-04-30');
    });

    it('with no day declared, it is due on the last of the month', () => {
      expect(dueDate('2026-09-01', null)).toBe('2026-09-30');
    });
  });

  describe('Absolute months', () => {
    it('subtracting two months gives the months in between', () => {
      expect(absoluteMonth('2026-01-01') - absoluteMonth('2025-11-01')).toBe(2);
    });
  });

  describe('What it is expected to cost', () => {
    /** The months of `byMonth`, already as Money. */
    const history = (months: Record<string, string>): Map<string, ReturnType<typeof toMoney>> =>
      new Map(Object.entries(months).map(([m, v]) => [m, toMoney(v)]));

    it('the three previous months go from the most recent to the oldest', () => {
      expect(previousMonths('2026-09')).toEqual(['2026-08', '2026-07', '2026-06']);
      // And across the year, without fighting December.
      expect(previousMonths('2026-02')).toEqual(['2026-01', '2025-12', '2025-11']);
    });

    it('averages the three previous months', () => {
      const byMonth = history({ '2026-06': '90000', '2026-07': '100000', '2026-08': '110000' });
      expect(estimateForMonth(byMonth, '2026-09')?.toFixed(2)).toBe('100000.00');
    });

    it('a month without a payment does NOT count as zero', () => {
      // Two of the three months. With the zero it would be 66,666: half of what
      // it really costs when it is due.
      const byMonth = history({ '2026-07': '100000', '2026-08': '100000' });
      expect(estimateForMonth(byMonth, '2026-09')?.toFixed(2)).toBe('100000.00');
    });

    it('with a single month, that month is the forecast', () => {
      expect(estimateForMonth(history({ '2026-08': '150000' }), '2026-09')?.toFixed(2)).toBe(
        '150000.00',
      );
    });

    it('a month with two payments comes already added up, and counts as ONE month', () => {
      // 300,000 in August and 100,000 in July: the two-month average is
      // 200,000, not the average of the three bills.
      const byMonth = history({ '2026-07': '100000', '2026-08': '300000' });
      expect(estimateForMonth(byMonth, '2026-09')?.toFixed(2)).toBe('200000.00');
    });

    it('with nothing in the three months, it falls back to the last month with a payment', () => {
      // The ANNUAL case: there are never payments in the three previous months.
      const byMonth = history({ '2025-09': '700000', '2024-09': '600000' });
      expect(estimateForMonth(byMonth, '2026-09')?.toFixed(2)).toBe('700000.00');
    });

    it('without history there is no forecast', () => {
      expect(estimateForMonth(new Map(), '2026-09')).toBeNull();
    });

    it('whatever comes AFTER the estimated month does not count', () => {
      // It can happen with a future period entered by hand.
      const byMonth = history({ '2026-10': '999999', '2025-09': '700000' });
      expect(estimateForMonth(byMonth, '2026-09')?.toFixed(2)).toBe('700000.00');
    });
  });
});

/**
 * The concept's budget, when it has one.
 *
 * Some expenses have a KNOWN value —a rent with a contract, a school fee— and
 * for those the average of the three previous months is worse than the
 * figure: the month paid with a surcharge drags it, and it changes by itself
 * from one month to the next without anyone touching anything.
 */
describe('What it is expected to cost', () => {
  const history = new Map([
    ['2026-08', toMoney('100000')],
    ['2026-07', toMoney('140000')],
    ['2026-06', toMoney('120000')],
  ]);

  it('with a budget, that number and not the average', () => {
    // The average of those three months is 120,000; the budget wins.
    expect(expectedForMonth(toMoney('180000'), history, '2026-09')?.toString()).toBe('180000');
  });

  it('the same month after month, even if the history changes', () => {
    // That is what having one means: a budget that moved with what it cost
    // before would not be a budget, it would be an influence.
    const other = new Map([['2026-08', toMoney('900000')]]);
    expect(expectedForMonth(toMoney('180000'), other, '2026-09')?.toString()).toBe('180000');
  });

  it('without a budget, the usual average', () => {
    expect(expectedForMonth(null, history, '2026-09')?.toString()).toBe(
      estimateForMonth(history, '2026-09')?.toString(),
    );
  });

  it('a ZERO budget is a budget, not a gap', () => {
    // Whoever writes 0 is saying «this costs nothing this year». Falling back
    // to the average would give back exactly the figure they meant to remove.
    expect(expectedForMonth(toMoney('0'), history, '2026-09')?.toString()).toBe('0');
  });

  it('without a budget and without history, there is no figure to give', () => {
    expect(expectedForMonth(null, new Map(), '2026-09')).toBeNull();
  });
});

/**
 * The automatic charge.
 *
 * A concept marked this way does not wait for anyone to record it: when its
 * day comes, the movement creates itself. What this function decides is
 * WHEN, and getting it wrong writes money that never left.
 */
describe('Charging by itself', () => {
  const base = {
    isAutoPaid: true,
    dueDateIso: '2026-09-20',
    todayIso: '2026-09-25',
    expected: toMoney('180000'),
  };

  it('charges once it is due', () => {
    expect(isAutoChargeDue(base)).toBe(true);
    // The same day counts: due today, charged today.
    expect(isAutoChargeDue({ ...base, todayIso: '2026-09-20' })).toBe(true);
  });

  it('does NOT charge ahead of the due date', () => {
    // A debit on the 20th has not gone out on the 3rd. Recording it earlier says
    // the money is gone when it is still there.
    expect(isAutoChargeDue({ ...base, todayIso: '2026-09-03' })).toBe(false);
  });

  it('touches nothing if the concept did not ask for it', () => {
    // Whoever does not turn it on wants to record by hand.
    expect(isAutoChargeDue({ ...base, isAutoPaid: false })).toBe(false);
  });

  it('without a figure it does not make one up', () => {
    // Without a budget and without history there is no number to put, and a
    // zero charge would be a lie written into the books. It stays pending.
    expect(isAutoChargeDue({ ...base, expected: null })).toBe(false);
  });

  it('the fingerprint identifies one concept and one month, and nothing else', () => {
    expect(chargeFingerprint(100n, '2026-09')).toBe('auto:100:2026-09');
    // However the month arrives, what counts is the year and the month.
    expect(chargeFingerprint(100n, '2026-09-20')).toBe('auto:100:2026-09');
    expect(chargeFingerprint(100n, '2026-10')).not.toBe(chargeFingerprint(100n, '2026-09'));
    expect(chargeFingerprint(101n, '2026-09')).not.toBe(chargeFingerprint(100n, '2026-09'));
  });
});

/**
 * A concept paid in several instalments.
 *
 * The real case: «Mercado», 1,200,000 a month, bought in four trips. Before,
 * the first trip took it off pending payments and for the rest of the month
 * the list said nothing was missing.
 */
describe('What is covered in pieces', () => {
  const expected = toMoney('1200000');
  const marked = (paid: string) =>
    pendingOutcome({
      isMultiPayment: true,
      hasPayment: paid !== '0',
      paid: toMoney(paid),
      expected,
    });

  it('is still due while what was paid does not reach what is expected', () => {
    expect(marked('0').isStillDue).toBe(true);
    expect(marked('320450').isStillDue).toBe(true);
    expect(marked('1199999.99').isStillDue).toBe(true);
  });

  it('stops being due on reaching it, not on passing it', () => {
    // Exactly equal IS covered: asking for one more peso would be asking for
    // something nobody owes.
    expect(marked('1200000').isStillDue).toBe(false);
    expect(marked('1350000').isStillDue).toBe(false);
  });

  it('while it is being covered, the month counts the EXPECTED and not the paid', () => {
    // «How much money do I need this month?» is answered with the total, not
    // with the advance. Counting what was paid would make the month's budget
    // grow with every trip to the market.
    expect(marked('0').towardBudget.toString()).toBe('1200000');
    expect(marked('320450').towardBudget.toString()).toBe('1200000');
  });

  it('and when it goes over, it counts what was PAID, which is already a fact', () => {
    expect(marked('1350000').towardBudget.toString()).toBe('1350000');
  });

  it('without a figure to reach it behaves as always', () => {
    // Otherwise it would be a pending payment that can never be settled:
    // permanent noise in the only list that says what is missing.
    const noFigure = pendingOutcome({
      isMultiPayment: true,
      hasPayment: true,
      paid: toMoney('50000'),
      expected: null,
    });
    expect(noFigure.isStillDue).toBe(false);
    expect(noFigure.towardBudget.toString()).toBe('50000');

    const zero = pendingOutcome({
      isMultiPayment: true,
      hasPayment: true,
      paid: toMoney('50000'),
      expected: toMoney('0'),
    });
    expect(zero.isStillDue).toBe(false);
  });
});

describe('A normal concept does not change its behavior', () => {
  const normal = (hasPayment: boolean, paid: string, expected: string | null) =>
    pendingOutcome({
      isMultiPayment: false,
      hasPayment,
      paid: toMoney(paid),
      expected: expected === null ? null : toMoney(expected),
    });

  it('a single cleared movement takes it off the list, even if it is less', () => {
    // It is the usual rule and it is not touched: a rent paid by half is
    // settled by whoever paid it, not by the list.
    const r = normal(true, '300000', '1200000');
    expect(r.isStillDue).toBe(false);
    expect(r.towardBudget.toString()).toBe('300000');
  });

  it('without a payment, it is due, and the month counts the expected', () => {
    const r = normal(false, '0', '1200000');
    expect(r.isStillDue).toBe(true);
    expect(r.towardBudget.toString()).toBe('1200000');
  });

  it('a ZERO movement also takes it off', () => {
    // The question is whether the movement EXISTS, not whether it adds up. A
    // zero is someone saying «this cost nothing this month», which is an answer.
    const r = normal(true, '0', '1200000');
    expect(r.isStillDue).toBe(false);
    expect(r.towardBudget.toString()).toBe('0');
  });

  it('without a payment and without a figure, it is due and adds nothing to the budget', () => {
    const r = normal(false, '0', null);
    expect(r.isStillDue).toBe(true);
    expect(r.towardBudget.toString()).toBe('0');
  });
});
