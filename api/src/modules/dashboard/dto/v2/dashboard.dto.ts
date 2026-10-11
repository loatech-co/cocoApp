import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

import { IsCalendarDate } from '../../../../common/validation/is-calendar-date.decorator';

export class DashboardQuery {
  @IsOptional()
  @IsCalendarDate({ message: 'La fecha desde debe ser un día real con formato YYYY-MM-DD.' })
  from?: string;

  @IsOptional()
  @IsCalendarDate({ message: 'La fecha hasta debe ser un día real con formato YYYY-MM-DD.' })
  to?: string;

  /** Only this category and its whole branch. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  categoryId?: number;

  /** Several ids, comma separated: `?categoryIds=3,7`. Each brings its whole branch. */
  @IsOptional()
  @IsString()
  @Matches(/^\d+(,\d+)*$/, { message: 'Las categorías deben ser números separados por coma.' })
  categoryIds?: string;

  /** Text search over description, merchant and notes, ignoring case. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  q?: string;
}
