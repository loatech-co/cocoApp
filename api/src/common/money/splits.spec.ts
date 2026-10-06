import { serialize, toMoney } from './money';
import { checkSplitsReconcile } from './splits';

describe('Splits reconciliation', () => {
  it('balances when the sum equals the amount exactly', () => {
    const result = checkSplitsReconcile(toMoney('150000'), [toMoney('105000'), toMoney('45000')]);

    expect(result.balances).toBe(true);
    expect(serialize(result.total)).toBe('150000.00');
    expect(serialize(result.difference)).toBe('0.00');
  });

  it('does not balance by a single cent — with money there is no "almost equal"', () => {
    const result = checkSplitsReconcile(toMoney('150000.00'), [
      toMoney('105000.00'),
      toMoney('45000.01'),
    ]);

    expect(result.balances).toBe(false);
    expect(serialize(result.difference)).toBe('0.01');
  });

  it('reports how much is missing so the UI can offer "adjust to the remainder"', () => {
    const result = checkSplitsReconcile(toMoney('150000'), [toMoney('105000')]);

    expect(result.balances).toBe(false);
    expect(serialize(result.difference)).toBe('-45000.00');
  });

  it('detects when the splits go over the total', () => {
    const result = checkSplitsReconcile(toMoney('150000'), [toMoney('105000'), toMoney('60000')]);

    expect(result.balances).toBe(false);
    expect(serialize(result.difference)).toBe('15000.00');
  });

  it('balances with divisions that give decimals', () => {
    // 100.000 split in three: 33.333,33 + 33.333,33 + 33.333,34
    const result = checkSplitsReconcile(toMoney('100000'), [
      toMoney('33333.33'),
      toMoney('33333.33'),
      toMoney('33333.34'),
    ]);

    expect(result.balances).toBe(true);
  });

  it('a transaction with no splits does not balance against a positive amount', () => {
    const result = checkSplitsReconcile(toMoney('150000'), []);

    expect(result.balances).toBe(false);
    expect(serialize(result.total)).toBe('0.00');
  });

  it('adds many small splits without drifting', () => {
    const splits = Array.from({ length: 100 }, () => toMoney('0.07'));
    const result = checkSplitsReconcile(toMoney('7.00'), splits);

    expect(result.balances).toBe(true);
    expect(serialize(result.total)).toBe('7.00');
  });
});
