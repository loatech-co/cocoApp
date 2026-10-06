import { ZERO, isPositive, rejectionReason, serialize, areEqual, sum, toMoney } from './money';
import { Prisma } from '../../generated/prisma/client';

describe('Money — exact arithmetic', () => {
  it('does not carry the floating-point error that `number` has', () => {
    // The reason this whole module exists.
    expect(0.1 + 0.2).not.toBe(0.3);

    const result = toMoney('0.10').plus(toMoney('0.20'));
    expect(areEqual(result, toMoney('0.30'))).toBe(true);
    expect(serialize(result)).toBe('0.30');
  });

  it('adds hundreds of transactions without losing a cent', () => {
    // 1000 × 0.01 must give exactly 10.00
    const amounts = Array.from({ length: 1000 }, () => toMoney('0.01'));
    expect(serialize(sum(amounts))).toBe('10.00');
  });

  it('adds realistic COP amounts without drifting', () => {
    const amounts = ['1250000.00', '89900.00', '32000.50', '195466.67'].map(toMoney);
    expect(serialize(sum(amounts))).toBe('1567367.17');
  });

  it('the sum of an empty list is zero, not NaN', () => {
    expect(serialize(sum([]))).toBe('0.00');
    expect(areEqual(sum([]), ZERO)).toBe(true);
  });

  it('normalises to 2 decimals with half-up rounding', () => {
    expect(serialize(toMoney('0.005'))).toBe('0.01');
    expect(serialize(toMoney('0.004'))).toBe('0.00');
    expect(serialize(toMoney('195466.666'))).toBe('195466.67');
    expect(serialize(toMoney('195466.664'))).toBe('195466.66');
  });

  it('always serialises with 2 decimals, even .00', () => {
    expect(serialize(toMoney(45000))).toBe('45000.00');
    expect(serialize(toMoney('1250000'))).toBe('1250000.00');
    expect(serialize(ZERO)).toBe('0.00');
  });

  it('takes string, number and Decimal as input', () => {
    const fromString = toMoney('89900.00');
    const fromNumber = toMoney(89900);
    const fromDecimal = toMoney(new Prisma.Decimal('89900'));

    expect(areEqual(fromString, fromNumber)).toBe(true);
    expect(areEqual(fromNumber, fromDecimal)).toBe(true);
  });

  describe('input validation', () => {
    it('accepts amounts that fit DECIMAL(15,2)', () => {
      expect(rejectionReason(toMoney('9999999999999.99'))).toBeNull();
      expect(rejectionReason(toMoney('0.01'))).toBeNull();
      expect(rejectionReason(ZERO)).toBeNull();
    });

    it('rejects more than 2 decimals instead of normalising silently', () => {
      // Careful: the raw Decimal is checked, not the one toMoney already normalised.
      const raw = new Prisma.Decimal('10.005');
      expect(rejectionReason(raw)).toMatch(/decimales/i);
    });

    it('rejects amounts that overflow the schema scale', () => {
      expect(rejectionReason(new Prisma.Decimal('10000000000000'))).toMatch(/excede/i);
    });

    it('rejects non-finite values', () => {
      expect(rejectionReason(new Prisma.Decimal(Infinity))).toMatch(/no es un número/i);
    });
  });

  it('tells positive from zero', () => {
    expect(isPositive(toMoney('0.01'))).toBe(true);
    expect(isPositive(ZERO)).toBe(false);
    expect(isPositive(toMoney('-0.01'))).toBe(false);
  });
});
