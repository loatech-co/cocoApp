import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class DashboardQuery {
  @IsOptional()
  @IsDateString({}, { message: 'La fecha desde debe tener formato YYYY-MM-DD.' })
  from?: string;

  @IsOptional()
  @IsDateString({}, { message: 'La fecha hasta debe tener formato YYYY-MM-DD.' })
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
