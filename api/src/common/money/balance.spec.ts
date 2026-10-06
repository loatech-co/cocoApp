import { computeAvailableCredit, computeBalance, type BalanceMovement } from './balance';
import { serialize, toMoney } from './money';
import type { AccountType } from '../../generated/prisma/client';

/** Shortcuts so the case tables read like the PRD's statement. */
const income = (amount: string, status: 'cleared' | 'pending' = 'cleared'): BalanceMovement => ({
  type: 'income',
  transferDir: null,
  amount: toMoney(amount),
  status,
});

const expense = (amount: string, status: 'cleared' | 'pending' = 'cleared'): BalanceMovement => ({
  type: 'expense',
  transferDir: null,
  amount: toMoney(amount),
  status,
});

const transferOut = (amount: string): BalanceMovement => ({
  type: 'transfer',
  transferDir: 'out',
  amount: toMoney(amount),
  status: 'cleared',
});

const transferIn = (amount: string): BalanceMovement => ({
  type: 'transfer',
  transferDir: 'in',
  amount: toMoney(amount),
  status: 'cleared',
});

const balanceOf = (
  type: AccountType,
  opening: string,
  movements: BalanceMovement[],
): { cleared: string; projected: string } => {
  const result = computeBalance(type, toMoney(opening), movements);
  return {
    cleared: serialize(result.cleared),
    projected: serialize(result.projected),
  };
};

describe('Derived balance — asset accounts', () => {
  it('S1 · no opening balance: +500.000 income, −120.000 expense → 380.000', () => {
    expect(balanceOf('debit', '0.00', [income('500000'), expense('120000')]).cleared).toBe(
      '380000.00',
    );
  });

  it('S2 · with an opening balance: 1.000.000 −250.000 −250.000 +100.000 → 600.000', () => {
    expect(
      balanceOf('bank', '1000000.00', [expense('250000'), expense('250000'), income('100000')])
        .cleared,
    ).toBe('600000.00');
  });

  it('S3 · an outgoing transfer subtracts from the source', () => {
    expect(balanceOf('savings', '0.00', [transferOut('300000')]).cleared).toBe('-300000.00');
  });

  it('S4 · an incoming transfer adds to the target', () => {
    expect(balanceOf('cash', '0.00', [transferIn('300000')]).cleared).toBe('300000.00');
  });

  it('a transfer does not change net worth: the two legs add up to zero', () => {
    const source = computeBalance('bank', toMoney('1000000'), [transferOut('300000')]);
    const target = computeBalance('savings', toMoney('0'), [transferIn('300000')]);

    const total = source.cleared.plus(target.cleared);
    expect(serialize(total)).toBe('1000000.00');
  });

  it('the PRD case: opening 500.000, +1.000.000, −300.000 → 1.200.000', () => {
    expect(balanceOf('debit', '500000.00', [income('1000000'), expense('300000')]).cleared).toBe(
      '1200000.00',
    );
  });

  it('stays exact to the cent with many-digit amounts', () => {
    expect(
      balanceOf('debit', '0.00', [income('195466.67'), expense('89900.33'), income('0.01')])
        .cleared,
    ).toBe('105566.35');
  });

  it('with no transactions, the balance is the opening one', () => {
    expect(balanceOf('cash', '250000.00', []).cleared).toBe('250000.00');
  });
});

describe('Derived balance — pending', () => {
  it('S5 · a pending expense leaves the cleared balance alone but moves the projected one', () => {
    const balance = balanceOf('debit', '0.00', [expense('50000', 'pending')]);

    expect(balance.cleared).toBe('0.00');
    expect(balance.projected).toBe('-50000.00');
  });

  it('the PRD case: adding a pending expense leaves the cleared balance intact', () => {
    const movements = [income('1000000'), expense('300000'), expense('100000', 'pending')];
    const balance = balanceOf('debit', '500000.00', movements);

    expect(balance.cleared).toBe('1200000.00');
    expect(balance.projected).toBe('1100000.00');
  });
});

describe('Derived balance — credit cards (liability)', () => {
  it('the balance is DEBT: a purchase raises it', () => {
    expect(balanceOf('credit', '0.00', [expense('430000')]).cleared).toBe('430000.00');
  });

  it('a transfer into the card is a payment: it lowers the debt', () => {
    expect(balanceOf('credit', '1000000.00', [transferIn('400000')]).cleared).toBe('600000.00');
  });

  it('income on the card (a refund) lowers the debt too', () => {
    expect(balanceOf('credit', '500000.00', [income('80000')]).cleared).toBe('420000.00');
  });

  it('spending and paying in the same period leaves the right net', () => {
    const balance = balanceOf('credit', '0.00', [
      expense('1200000'),
      expense('300000'),
      transferIn('1000000'),
    ]);
    expect(balance.cleared).toBe('500000.00');
  });

  it('flips the sign against an asset account with the same transactions', () => {
    const movements = [expense('100000'), income('30000')];

    expect(balanceOf('debit', '0.00', movements).cleared).toBe('-70000.00');
    expect(balanceOf('credit', '0.00', movements).cleared).toBe('70000.00');
  });
});

describe('Available credit', () => {
  it('is the limit minus what is owed', () => {
    const available = computeAvailableCredit(toMoney('5000000'), toMoney('1240000'));
    expect(serialize(available!)).toBe('3760000.00');
  });

  it('goes negative if the limit was exceeded — reported, not blocked', () => {
    const available = computeAvailableCredit(toMoney('1000000'), toMoney('1150000'));
    expect(serialize(available!)).toBe('-150000.00');
  });

  it('is null when the account has no limit set', () => {
    expect(computeAvailableCredit(null, toMoney('500000'))).toBeNull();
  });
});

describe('Derived balance — incomplete data', () => {
  it('a transfer without a direction contributes zero instead of inventing a sign', () => {
    const corrupt: BalanceMovement = {
      type: 'transfer',
      transferDir: null,
      amount: toMoney('300000'),
      status: 'cleared',
    };

    expect(balanceOf('debit', '100000.00', [corrupt]).cleared).toBe('100000.00');
  });
});
