import { restrictToBranch } from './dashboard.branch';
import { toMoney } from '../../common/money/money';
import type { SummaryMovement } from '../transactions/ledger.service';

function movement(partial: Partial<SummaryMovement>): SummaryMovement {
  return {
    date: new Date('2026-09-10'),
    period: new Date('2026-09-01'),
    type: 'expense',
    amount: toMoney('100'),
    categoryId: null,
    splits: [],
    ...partial,
  };
}

describe('restrictToBranch', () => {
  const branch = [1n, 2n];

  it('leaves everything alone without a branch', () => {
    const rows = [
      movement({ categoryId: 9n }),
      movement({ splits: [{ categoryId: 9n, amount: toMoney('100') }] }),
    ];
    expect(restrictToBranch(rows, null)).toEqual(rows);
  });

  it('keeps a plain row: it matched by its own category', () => {
    const row = movement({ categoryId: 1n });
    expect(restrictToBranch([row], branch)).toEqual([row]);
  });

  it('trims a mixed split row to the parts inside the branch and re-derives its amount', () => {
    const row = movement({
      amount: toMoney('100'),
      splits: [
        { categoryId: 1n, amount: toMoney('30') },
        { categoryId: 7n, amount: toMoney('60') },
        { categoryId: null, amount: toMoney('10') },
      ],
    });
    const [trimmed] = restrictToBranch([row], branch);
    expect(trimmed?.amount.toString()).toBe('30');
    expect(trimmed?.splits).toEqual([{ categoryId: 1n, amount: toMoney('30') }]);
  });

  it('drops a split row that only touched the branch through its header', () => {
    const row = movement({
      categoryId: 1n,
      splits: [{ categoryId: 7n, amount: toMoney('100') }],
    });
    expect(restrictToBranch([row], branch)).toEqual([]);
  });
});
