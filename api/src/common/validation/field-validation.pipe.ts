import { BadRequestException, ValidationPipe, type ValidationError } from '@nestjs/common';

import type { ErrorDetail } from '../errors/domain-error';

/**
 * One problem per invalid field, with the path that reaches it
 * (`splits.0.amount`). Nested errors carry no message of their own: only the
 * leaves with constraints do.
 */
function fieldErrors(errors: readonly ValidationError[], parent = ''): ErrorDetail[] {
  return errors.flatMap((error) => {
    const field = parent === '' ? error.property : `${parent}.${error.property}`;
    const own = Object.values(error.constraints ?? {}).map((message) => ({ field, message }));
    return [...own, ...fieldErrors(error.children ?? [], field)];
  });
}

/**
 * The global `ValidationPipe`, keeping WHICH field failed.
 *
 * Nest's own factory flattens the errors into sentences and drops the field
 * (`message` is still that exact list). The API answers with `errors[]`, each
 * pointing at its field, from `fields`.
 */
export class FieldValidationPipe extends ValidationPipe {
  public override createExceptionFactory() {
    return (errors: ValidationError[] = []) =>
      new BadRequestException({
        message: this.flattenValidationErrors(errors),
        error: 'Bad Request',
        statusCode: 400,
        fields: fieldErrors(errors),
      });
  }
}
