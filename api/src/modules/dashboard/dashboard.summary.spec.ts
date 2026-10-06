import { treeOf, breakdown, pendingThisMonth, liveRecurring, trend } from './dashboard.summary';
import { serialize } from '../../common/money/money';
import { Prisma } from '../../generated/prisma/client';
import type { SummaryCategory } from '../categories/category-lookup.service';
import type { SummaryMovement } from '../transactions/ledger.service';

function makeCategory(overrides: Partial<SummaryCategory> & { id: bigint }): SummaryCategory {
  return {
    name: `Categoría ${overrides.id}`,
    color: null,
    icon: null,
    parentId: null,
    isRecurring: false,
    periodicity: null,
    paymentDay: null,
    paymentMonth: null,
    budget: null,
    isAutoPaid: false,
    isMultiPayment: false,
    isArchived: false,
    ...overrides,
  };
}

function makeMovement(
  overrides: Omit<Partial<SummaryMovement>, 'amount' | 'date' | 'period'> & {
    amount?: string;
    date?: string;
    period?: string;
  } = {},
): SummaryMovement {
  const { amount = '1000', date = '2026-03-10', period, ...rest } = overrides;
  return {
    type: 'expense',
    categoryId: null,
    splits: [],
    ...rest,
    amount: new Prisma.Decimal(amount),
    date: new Date(date),
    period: new Date(period ?? `${date.slice(0, 7)}-01`),
  };
}

describe('trend', () => {
  it('snaps a payment outside a day axis to its nearest edge, so the line adds up', () => {
    const { granularity, points } = trend(
      [
        makeMovement({ date: '2026-04-06', period: '2026-03-01', amount: '300' }),
        makeMovement({ date: '2026-02-27', period: '2026-03-01', amount: '200' }),
        makeMovement({ date: '2026-03-15', amount: '100' }),
        makeMovement({ type: 'transfer', date: '2026-03-15', amount: '999' }),
      ],
      new Date('2026-03-01'),
      new Date('2026-03-31'),
    );

    expect(granularity).toBe('day');
    expect(points[0]!.expense).toBe('200.00');
    expect(points[points.length - 1]!.expense).toBe('300.00');
    expect(points.reduce((n, p) => n + p.count, 0)).toBe(3);
  });
});

describe('breakdown', () => {
  const tree = treeOf([
    makeCategory({ id: 1n, name: 'Hogar' }),
    makeCategory({ id: 2n, name: 'Oficina' }),
  ]);

  it('splits a movement across the centers of its parts and keeps the unclassified apart', () => {
    const { byCostCenter } = breakdown(
      [
        makeMovement({
          amount: '1000',
          categoryId: 1n,
          splits: [
            { categoryId: 1n, amount: new Prisma.Decimal('600') },
            { categoryId: 2n, amount: new Prisma.Decimal('400') },
          ],
        }),
        makeMovement({ amount: '50' }),
      ],
      tree,
      undefined,
    );

    const byName = Object.fromEntries(byCostCenter.map((r) => [r.name, r]));
    expect(Object.keys(byName).sort()).toEqual(['Hogar', 'Oficina', 'Sin clasificar']);
    expect(byName['Sin clasificar']).toMatchObject({ categoryId: null, color: null });
  });
});

describe('pendingThisMonth', () => {
  it('leaves out a quarterly concept that is not due this month', () => {
    const quarterly = makeCategory({
      id: 3n,
      name: 'Predial',
      isRecurring: true,
      periodicity: 'quarterly',
      paymentMonth: 1,
      paymentDay: 10,
      budget: new Prisma.Decimal('90000'),
    });
    const result = pendingThisMonth(
      liveRecurring([quarterly]),
      { history: new Map(), paidThisMonth: new Map() },
      '2026-03',
      treeOf([quarterly]),
    );
    expect(result.pending).toEqual([]);
    expect(serialize(result.budget)).toBe('0.00');
  });
});
