import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/**
 * The same filters as the movements list, on purpose.
 *
 * The summary and the list are two views of the SAME slice: whoever filters by
 * "Servicios públicos" in the summary and jumps to movements expects to see
 * those movements, not all of them. Two different sets of filters would
 * guarantee that the figures on one screen do not explain those on the other.
 */
export class DashboardQueryDto {
  /** Start of the range, inclusive. By default, the 1st of the current month. */
  @IsOptional()
  @IsDateString({}, { message: 'La fecha desde debe tener formato YYYY-MM-DD.' })
  from?: string;

  /** End of the range, inclusive. By default, today. */
  @IsOptional()
  @IsDateString({}, { message: 'La fecha hasta debe tener formato YYYY-MM-DD.' })
  to?: string;

  /** Cost center, category or concept. Includes its whole branch. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  category_id?: number;

  /** Several, comma separated. Each brings its whole branch. */
  @IsOptional()
  @IsString()
  @Matches(/^\d+(,\d+)*$/, {
    message: 'Las categorías deben ser números separados por coma.',
  })
  category_ids?: string;

  /** Searches description, merchant and notes, ignoring case. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  q?: string;
}
