import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';

import { Prisma } from '../../generated/prisma/client';
import { rejectionReason } from '../money/money';

/**
 * Checks that a field is an amount that fits DECIMAL(15,2).
 *
 * It accepts a string or a number in the input JSON, but the service always
 * turns it into `Prisma.Decimal` before touching the database: `number` is
 * only tolerated at the edge, never in arithmetic.
 */
export function IsMoney(options?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isMoney',
      target: object.constructor,
      propertyName,
      ...(options !== undefined && { options }),
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'string' && typeof value !== 'number') return false;
          try {
            return rejectionReason(new Prisma.Decimal(value)) === null;
          } catch {
            return false;
          }
        },
        defaultMessage(args: ValidationArguments): string {
          const value = args.value as unknown;
          if (typeof value !== 'string' && typeof value !== 'number') {
            return `${args.property} debe ser un monto (string o número).`;
          }
          try {
            return (
              rejectionReason(new Prisma.Decimal(value)) ??
              `${args.property} no es un monto válido.`
            );
          } catch {
            return `${args.property} no es un monto válido.`;
          }
        },
      },
    });
  };
}

/**
 * Like IsMoney, but it also requires it to be greater than zero.
 * A transaction's `amount` can never be 0 or negative: the economic sign
 * comes from `type`, not from the number's sign.
 */
export function IsPositiveMoney(options?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isPositiveMoney',
      target: object.constructor,
      propertyName,
      ...(options !== undefined && { options }),
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'string' && typeof value !== 'number') return false;
          try {
            const decimal = new Prisma.Decimal(value);
            return rejectionReason(decimal) === null && decimal.greaterThan(0);
          } catch {
            return false;
          }
        },
        defaultMessage(args: ValidationArguments): string {
          return `${args.property} debe ser un monto mayor que cero.`;
        },
      },
    });
  };
}
