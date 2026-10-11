import { ValidateIf } from 'class-validator';

/**
 * A field that may be left out, but not set to `null`.
 *
 * `@IsOptional()` skips every other check when the value is `null` as well as
 * when it is missing, so `{ "date": null }` reached the service and became
 * 1970-01-01, and `{ "amount": null }` blew up inside Prisma as a 500. This
 * one skips the checks only when the field is absent: present, it goes
 * through the rest of its decorators, and `null` fails them like any other
 * wrong value. The fields that DO admit `null` (clearing a category, a
 * budget) keep `@IsOptional()`.
 */
export function IfPresent(): PropertyDecorator {
  return ValidateIf((_object: object, value: unknown) => value !== undefined);
}
