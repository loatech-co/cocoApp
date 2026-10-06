/**
 * Teaches `JSON.stringify` to serialise BigInt.
 *
 * The schema's primary keys are `BIGINT`, and Prisma hands them out as
 * JavaScript `bigint`. Without this, any response that includes an id fails
 * with "Do not know how to serialize a BigInt".
 *
 * It is written as a number while it fits the safe range (2^53), which covers
 * any realistic volume of this app, and as a string if it ever went past it —
 * so precision is never lost silently.
 *
 * Careful: this does NOT apply to amounts. Money is `Decimal`, and
 * `Prisma.Decimal` already serialises to a string on its own, which is
 * exactly what we want: an amount must never travel as a `number`.
 */
export function installBigIntSerializer(): void {
  const MAX = BigInt(Number.MAX_SAFE_INTEGER);
  const MIN = BigInt(Number.MIN_SAFE_INTEGER);

  Object.defineProperty(BigInt.prototype, 'toJSON', {
    value: function toJSON(this: bigint): number | string {
      return this <= MAX && this >= MIN ? Number(this) : this.toString();
    },
    writable: true,
    configurable: true,
    enumerable: false,
  });
}
