import { applyDecorators } from '@nestjs/common';
import { IsDateString, Matches, type ValidationOptions } from 'class-validator';

/**
 * A plain calendar day, `YYYY-MM-DD`, that exists.
 *
 * `@IsDateString()` alone took `2026-02-30` (it only checks the shape) and
 * `2026-02-10T23:30:00-05:00`, which `new Date()` then stored as the day
 * after in UTC (R4-A, A3). The shape is pinned by the pattern and the
 * calendar by the strict check, which refuses the 30th of February.
 */
export function IsCalendarDate(options?: ValidationOptions): PropertyDecorator {
  return applyDecorators(
    Matches(/^\d{4}-\d{2}-\d{2}$/, options),
    IsDateString({ strict: true, strictSeparator: true }, options),
  );
}
