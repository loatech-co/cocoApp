import {
  ancestorAtLevel,
  computeFlow,
  computeExpenseByCategory,
  rangeBuckets,
  daysInRange,
  granularityFor,
  type AggregableMovement,
} from './dashboard.aggregate';
import { serialize, toMoney } from '../../common/money/money';

const movement = (
  type: AggregableMovement['type'],
  amount: string,
  categoryId: number | null = null,
  splits: { categoryId: number | null; amount: string }[] = [],
): AggregableMovement => ({
  type,
  amount: toMoney(amount),
  categoryId: categoryId === null ? null : BigInt(categoryId),
  splits: splits.map((split) => ({
    categoryId: split.categoryId === null ? null : BigInt(split.categoryId),
    amount: toMoney(split.amount),
  })),
});

describe('Period flow', () => {
  it('adds income and expense separately and computes the net', () => {
    const flow = computeFlow([
      movement('income', '5200000'),
      movement('expense', '3180000'),
      movement('expense', '800000'),
    ]);

    expect(serialize(flow.income)).toBe('5200000.00');
    expect(serialize(flow.expense)).toBe('3980000.00');
    expect(serialize(flow.net)).toBe('1220000.00');
  });

  it('EXCLUDES transfers: they are neither income nor expense', () => {
    const withTransfers = computeFlow([
      movement('income', '1000000'),
      movement('expense', '400000'),
      movement('transfer', '300000'),
      movement('transfer', '300000'),
    ]);

    expect(serialize(withTransfers.income)).toBe('1000000.00');
    expect(serialize(withTransfers.expense)).toBe('400000.00');
    expect(serialize(withTransfers.net)).toBe('600000.00');
  });

  it('a period with no movements gives zeros, not NaN', () => {
    const flow = computeFlow([]);
    expect(serialize(flow.income)).toBe('0.00');
    expect(serialize(flow.net)).toBe('0.00');
  });

  it('the net can be negative and is reported as is', () => {
    const flow = computeFlow([movement('income', '1000000'), movement('expense', '1500000')]);
    expect(serialize(flow.net)).toBe('-500000.00');
  });
});

describe('Expense by category', () => {
  it('groups by category and sorts from largest to smallest', () => {
    const result = computeExpenseByCategory([
      movement('expense', '100000', 1),
      movement('expense', '500000', 2),
      movement('expense', '50000', 1),
    ]);

    expect(result).toHaveLength(2);
    expect(result[0]!.category_id).toBe(BigInt(2));
    expect(serialize(result[0]!.total)).toBe('500000.00');
    expect(serialize(result[1]!.total)).toBe('150000.00');
    expect(result[1]!.count).toBe(2);
  });

  it('with splits, it distributes by them and not by the header category', () => {
    // A 150,000 purchase split between groceries(5) and cleaning(9).
    const result = computeExpenseByCategory([
      movement('expense', '150000', 5, [
        { categoryId: 5, amount: '105000' },
        { categoryId: 9, amount: '45000' },
      ]),
    ]);

    const groceries = result.find((row) => row.category_id === BigInt(5))!;
    const cleaning = result.find((row) => row.category_id === BigInt(9))!;

    expect(serialize(groceries.total)).toBe('105000.00');
    expect(serialize(cleaning.total)).toBe('45000.00');
    // And 150,000 was not counted again in the header category.
    expect(result).toHaveLength(2);
  });

  it('groups movements without a category instead of hiding them', () => {
    const result = computeExpenseByCategory([
      movement('expense', '80000', null),
      movement('expense', '20000', null),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]!.category_id).toBeNull();
    expect(serialize(result[0]!.total)).toBe('100000.00');
  });

  it('ignores income and transfers', () => {
    const result = computeExpenseByCategory([
      movement('income', '5000000', 1),
      movement('transfer', '300000', 1),
      movement('expense', '100000', 1),
    ]);

    expect(result).toHaveLength(1);
    expect(serialize(result[0]!.total)).toBe('100000.00');
  });

  it('the total by category matches the total expense of the flow', () => {
    const movements = [
      movement('expense', '150000', 5, [
        { categoryId: 5, amount: '105000' },
        { categoryId: 9, amount: '45000' },
      ]),
      movement('expense', '89900', 12),
      movement('expense', '30000', null),
      movement('income', '5000000', 1),
    ];

    const flow = computeFlow(movements);
    const byCategory = computeExpenseByCategory(movements);
    const sumByCategory = byCategory.reduce((total, row) => total.plus(row.total), toMoney(0));

    // If these two figures do not match, the dashboard would be lying.
    expect(serialize(sumByCategory)).toBe(serialize(flow.expense));
  });
});

describe('Three-level hierarchy', () => {
  // Fixed costs(1) → Utilities(2) → Celsia(3)
  const tree = new Map([
    ['1', { id: BigInt(1), parentId: null }],
    ['2', { id: BigInt(2), parentId: BigInt(1) }],
    ['3', { id: BigInt(3), parentId: BigInt(2) }],
  ]);

  it('climbs from a concept to its cost center', () => {
    expect(ancestorAtLevel(tree, BigInt(3), 1)).toBe(BigInt(1));
  });

  it('climbs from a concept to its category', () => {
    expect(ancestorAtLevel(tree, BigInt(3), 2)).toBe(BigInt(2));
  });

  it('a concept asked for at its own level returns itself', () => {
    expect(ancestorAtLevel(tree, BigInt(3), 3)).toBe(BigInt(3));
  });

  it('a center has no level 2: it returns null instead of making one up', () => {
    expect(ancestorAtLevel(tree, BigInt(1), 2)).toBeNull();
  });

  it('without a category there is no ancestor', () => {
    expect(ancestorAtLevel(tree, null, 1)).toBeNull();
  });

  it('a cycle does not hang the process', () => {
    const cycle = new Map([
      ['1', { id: BigInt(1), parentId: BigInt(2) }],
      ['2', { id: BigInt(2), parentId: BigInt(1) }],
    ]);
    expect(() => ancestorAtLevel(cycle, BigInt(1), 1)).not.toThrow();
  });
});

describe('Trend', () => {
  const d = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

  it('a short range is grouped by day', () => {
    expect(granularityFor(d('2025-03-01'), d('2025-03-31'))).toBe('day');
  });

  it('a long range is grouped by month: 365 points are not a trend', () => {
    expect(granularityFor(d('2025-01-01'), d('2025-12-31'))).toBe('month');
  });

  it('two months are still days', () => {
    expect(granularityFor(d('2025-03-01'), d('2025-04-30'))).toBe('day');
  });

  it('"the last 3 months" is ALWAYS grouped by month, whatever month it falls in', () => {
    // Counting days this was not stable: Feb-Apr is 61 days and May-Jul is 92,
    // so the same button changed the axis unit depending on the month.
    expect(granularityFor(d('2025-02-01'), d('2025-04-02'))).toBe('month');
    expect(granularityFor(d('2025-05-01'), d('2025-07-02'))).toBe('month');
  });

  it('includes the EMPTY buckets: a blank month has to show flat', () => {
    const buckets = rangeBuckets(d('2025-01-01'), d('2025-03-31'), 'month');
    expect(buckets).toEqual(['2025-01', '2025-02', '2025-03']);
  });

  it('the last day of the range is included', () => {
    const buckets = rangeBuckets(d('2025-03-01'), d('2025-03-03'), 'day');
    expect(buckets).toEqual(['2025-03-01', '2025-03-02', '2025-03-03']);
  });

  it('counts both ends of the range', () => {
    expect(daysInRange(d('2025-03-01'), d('2025-03-01'))).toBe(1);
    expect(daysInRange(d('2025-03-01'), d('2025-03-31'))).toBe(31);
  });
});
