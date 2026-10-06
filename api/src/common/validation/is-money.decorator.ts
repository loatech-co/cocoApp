import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';

import { Prisma } from '../../generated/prisma/client';
import { rejectionReason } from '../money/money';

/**
 * Valida que un campo sea un monto representable en DECIMAL(15,2).
 *
 * Acepta string o number en el JSON de entrada, pero el servicio siempre lo
 * convierte a `Prisma.Decimal` antes de tocar la base: el `number` solo se
 * tolera en el borde, jamás en la aritmética.
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
 * Como IsMoney, pero además exige que sea mayor que cero.
 * El `amount` de un movimiento nunca puede ser 0 ni negativo: el signo
 * económico lo da `type`, no el signo del número.
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
