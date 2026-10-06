import { Injectable, type PipeTransform } from '@nestjs/common';

import { BadRequestError } from '../errors/domain-error';

/**
 * Turns a route parameter into a `bigint`.
 *
 * Primary keys are BIGINT. Using `Number` would truncate them silently if they
 * ever went past 2^53, and a truncated id points at ANOTHER row — a data bug
 * that gives no warning. Anything that is not a positive integer is rejected.
 */
@Injectable()
export class ParseBigIntPipe implements PipeTransform<string, bigint> {
  transform(value: string): bigint {
    if (!/^\d+$/.test(value)) {
      throw new BadRequestError('El identificador debe ser un número entero positivo.', {
        code: 'invalid_id',
      });
    }
    return BigInt(value);
  }
}
