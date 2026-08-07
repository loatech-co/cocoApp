/**
 * Enseña a `JSON.stringify` a serializar BigInt.
 *
 * Las PK del esquema son `BIGINT UNSIGNED`, y Prisma las entrega como `bigint`
 * de JavaScript. Sin esto, cualquier respuesta que incluya un id revienta con
 * "Do not know how to serialize a BigInt".
 *
 * Se emite como number mientras quepa en el rango seguro (2^53), que cubre
 * cualquier volumen realista de esta app, y como string si alguna vez lo
 * excediera — así nunca se pierde precisión en silencio.
 *
 * Ojo: esto NO aplica a los montos. El dinero es `Decimal`, y `Prisma.Decimal`
 * ya serializa a string por su cuenta, que es justo lo que queremos: un monto
 * jamás debe viajar como `number`.
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
