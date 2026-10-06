import { Prisma } from '../../generated/prisma/client';

/**
 * Todo monto del sistema. Es `Prisma.Decimal` (decimal.js por dentro), nunca
 * `number`.
 *
 * Por qué importa tanto: el `number` de JavaScript es un flotante IEEE-754 y no
 * puede representar exactamente 0.10 ni 0.01. `0.1 + 0.2 === 0.30000000000000004`.
 * Sumar cientos de movimientos con eso acumula error, y el resultado es un
 * saldo que no cuadra por centavos — el síntoma exacto que hace que un usuario
 * deje de creerle a una app de finanzas.
 */
export type Money = Prisma.Decimal;

/** Escala del esquema: DECIMAL(15,2). */
const SCALE = 2;

export const ZERO: Money = new Prisma.Decimal(0);

/**
 * Convierte a Money y normaliza a 2 decimales con redondeo half-up (el mismo
 * que espera cualquier persona al mirar una cifra: 0.005 → 0.01).
 */
export function toMoney(value: string | number | Prisma.Decimal): Money {
  const decimal = value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
  return decimal.toDecimalPlaces(SCALE, Prisma.Decimal.ROUND_HALF_UP);
}

/** Suma exacta. Nunca uses `reduce((a, b) => a + b)` con montos. */
export function sum(values: readonly Money[]): Money {
  return values.reduce<Money>((total, value) => total.plus(value), ZERO);
}

/** Igualdad exacta de montos. `===` compararía referencias de objeto. */
export function areEqual(a: Money, b: Money): boolean {
  return a.equals(b);
}

export function isPositive(value: Money): boolean {
  return value.greaterThan(ZERO);
}

/**
 * Serializa para la API: siempre string con 2 decimales.
 *
 * String y no número: un `number` en JSON vuelve a ser un flotante en el
 * cliente, y aunque ahí solo se muestre, deja la puerta abierta a que alguien
 * haga aritmética con él. El contrato lo cierra.
 */
export function serialize(value: Money): string {
  return value.toFixed(SCALE);
}

/**
 * Valida que un monto de entrada sea representable en DECIMAL(15,2) sin
 * pérdida. Devuelve el motivo del rechazo, o `null` si es válido.
 */
export function rejectionReason(value: Money): string | null {
  if (!value.isFinite()) {
    return 'El monto no es un número válido.';
  }
  if (value.decimalPlaces() > SCALE) {
    return `El monto no puede tener más de ${SCALE} decimales.`;
  }
  // DECIMAL(15,2) admite 13 dígitos de parte entera.
  if (value.abs().greaterThanOrEqualTo(new Prisma.Decimal('10000000000000'))) {
    return 'El monto excede el máximo representable.';
  }
  return null;
}
