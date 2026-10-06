import { Prisma } from '../../generated/prisma/client';

/**
 * Every amount in the system. It is `Prisma.Decimal` (decimal.js inside),
 * never `number`.
 *
 * Why it matters so much: JavaScript's `number` is an IEEE-754 float and cannot
 * represent 0.10 or 0.01 exactly. `0.1 + 0.2 === 0.30000000000000004`. Adding
 * hundreds of transactions that way piles up error, and the result is a
 * balance that is off by cents — the exact symptom that makes a user stop
 * believing a finance app.
 */
export type Money = Prisma.Decimal;

/** The schema's scale: DECIMAL(15,2). */
const SCALE = 2;

export const ZERO: Money = new Prisma.Decimal(0);

/**
 * Converts to Money and normalises to 2 decimals with half-up rounding (the
 * one anybody expects when looking at a figure: 0.005 → 0.01).
 */
export function toMoney(value: string | number | Prisma.Decimal): Money {
  const decimal = value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
  return decimal.toDecimalPlaces(SCALE, Prisma.Decimal.ROUND_HALF_UP);
}

/** Exact sum. Never use `reduce((a, b) => a + b)` on amounts. */
export function sum(values: readonly Money[]): Money {
  return values.reduce<Money>((total, value) => total.plus(value), ZERO);
}

/** Exact equality of amounts. `===` would compare object references. */
export function areEqual(a: Money, b: Money): boolean {
  return a.equals(b);
}

export function isPositive(value: Money): boolean {
  return value.greaterThan(ZERO);
}

/**
 * Serialises for the API: always a string with 2 decimals.
 *
 * A string and not a number: a `number` in JSON becomes a float again on the
 * client, and even if it is only displayed there, it leaves the door open to
 * someone doing arithmetic with it. The contract closes it.
 */
export function serialize(value: Money): string {
  return value.toFixed(SCALE);
}

/**
 * Checks that an input amount fits DECIMAL(15,2) without loss. Returns the
 * reason it is rejected (user-facing), or `null` if it is valid.
 */
export function rejectionReason(value: Money): string | null {
  if (!value.isFinite()) {
    return 'El monto no es un número válido.';
  }
  if (value.decimalPlaces() > SCALE) {
    return `El monto no puede tener más de ${SCALE} decimales.`;
  }
  // DECIMAL(15,2) allows 13 digits in the integer part.
  if (value.abs().greaterThanOrEqualTo(new Prisma.Decimal('10000000000000'))) {
    return 'El monto excede el máximo representable.';
  }
  return null;
}
