import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** Largest page a client may ask for; without a cap, one call could ask for years. */
const MAX_PER_PAGE = 200;
/** Page size when the client does not say. */
export const DEFAULT_PER_PAGE = 50;

/** `?page=&perPage=`, shared by every v2 list. */
export class PageQuery {
  /** 1-based; 1 by default. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  /** 50 by default, at most 200. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PER_PAGE)
  perPage?: number;
}
