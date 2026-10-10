import { BadRequestException, ValidationPipe, type ValidationError } from '@nestjs/common';

import { spanishValidationMessage } from './validation-messages';
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
 * Rewrites, in place, class-validator's English defaults into the Spanish of
 * `validation-messages.ts`. The decorators' own messages are left as written.
 */
function translateDefaults(errors: readonly ValidationError[], parent = ''): void {
  for (const error of errors) {
    const path = parent === '' ? error.property : `${parent}.${error.property}`;
    const constraints = error.constraints;
    if (constraints !== undefined) {
      for (const [constraint, message] of Object.entries(constraints)) {
        constraints[constraint] = spanishValidationMessage(
          constraint,
          error.property,
          path,
          message,
        );
      }
    }
    translateDefaults(error.children ?? [], path);
  }
}

/**
 * The global `ValidationPipe`, keeping WHICH field failed.
 *
 * Nest's own factory flattens the errors into sentences and drops the field
 * (`message` is still that exact list). The API answers with `errors[]`, each
 * pointing at its field, from `fields`. Both carry the Spanish message.
 */
export class FieldValidationPipe extends ValidationPipe {
  public override createExceptionFactory() {
    return (errors: ValidationError[] = []) => {
      translateDefaults(errors);
      return new BadRequestException({
        message: this.flattenValidationErrors(errors),
        error: 'Bad Request',
        statusCode: 400,
        fields: fieldErrors(errors),
      });
    };
  }
}
