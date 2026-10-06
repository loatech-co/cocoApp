import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { CATEGORY_KINDS, PERIODICITIES } from '../../../../contract/v2/categories.response';
import { PageQuery } from '../../../../contract/v2/page.dto';
import { mergeKeywords } from '../../keywords';

const HEX = /^#[0-9A-Fa-f]{6}$/;
/**
 * How many keywords a concept accepts and how long each one may be.
 *
 * The cap is not a technical limit: thirty words to recognize a creditor are
 * no longer signals, they are a net that catches any receipt. And it lives
 * here —in the contract— so a client other than this screen cannot fill the
 * column either.
 */
export const MAX_KEYWORDS = 30;
const LONGEST_KEYWORD = 60;

type CategoryKind = (typeof CATEGORY_KINDS)[number];
type Periodicity = (typeof PERIODICITIES)[number];

/** No empty words, no repeats, in the order they came. */
function cleanKeywords({ value }: { value: unknown }): unknown {
  if (!Array.isArray(value)) return value;
  if (value.some((word) => typeof word !== 'string')) return value;
  return mergeKeywords(value as string[]);
}

/** What a category may carry, created or edited. */
class CategoryFields {
  @IsOptional()
  @Matches(HEX, { message: 'El color debe ser hexadecimal, formato #RRGGBB.' })
  color?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  icon?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  /** Whether the concept is paid every so often. */
  @IsOptional()
  @IsBoolean()
  isRecurring?: boolean;

  /** Whether the cost center refuses reclassification from the transactions table. */
  @IsOptional()
  @IsBoolean()
  isStatic?: boolean;

  @IsOptional()
  @IsIn(PERIODICITIES, { message: 'La periodicidad no es válida.' })
  periodicity?: Periodicity | null;

  /** Day of the month it is due, 1–31. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'El día de pago va del 1 al 31.' })
  @Max(31, { message: 'El día de pago va del 1 al 31.' })
  paymentDay?: number | null;

  /** Reference month of the cycle, 1–12. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'El mes va del 1 al 12.' })
  @Max(12, { message: 'El mes va del 1 al 12.' })
  paymentMonth?: number | null;

  /** Whether the transaction is created on its own on the due day. */
  @IsOptional()
  @IsBoolean()
  isAutoPaid?: boolean;

  /** Whether it is paid in several parts rather than settled at once. */
  @IsOptional()
  @IsBoolean()
  isMultiPayment?: boolean;

  /** Expected cost each time, up to two decimals. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'El presupuesto admite hasta dos decimales.' })
  @Min(0, { message: 'El presupuesto no puede ser negativo.' })
  @Max(9_999_999_999_999, { message: 'Ese presupuesto es demasiado grande.' })
  budget?: number | null;

  /** Words looked for in a receipt to recognise this concept. */
  @IsOptional()
  @Transform(cleanKeywords)
  @IsArray()
  @ArrayMaxSize(MAX_KEYWORDS, {
    message: `Un concepto admite hasta ${MAX_KEYWORDS} palabras clave.`,
  })
  @IsString({ each: true })
  @MaxLength(LONGEST_KEYWORD, { each: true })
  keywords?: string[];
}

export class CreateCategoryInput extends CategoryFields {
  @IsString()
  @MinLength(1, { message: 'El nombre no puede estar vacío.' })
  @MaxLength(255)
  name!: string;

  @IsIn(CATEGORY_KINDS, { message: 'El tipo de categoría no es válido.' })
  kind!: CategoryKind;

  /** Absent for a cost center, the top of the tree. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  parentId?: number;
}

export class UpdateCategoryInput extends CategoryFields {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsIn(CATEGORY_KINDS)
  kind?: CategoryKind;

  /** `null` makes it a cost center. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  parentId?: number | null;

  @IsOptional()
  @IsBoolean()
  isArchived?: boolean;
}

export class ListCategoriesQuery extends PageQuery {
  @IsOptional()
  @IsIn(CATEGORY_KINDS)
  kind?: CategoryKind;

  /** `true` to include archived categories. */
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  includeArchived?: boolean;
}

export class ReorderItemInput {
  @Type(() => Number)
  @IsInt()
  id!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder!: number;
}

export class ReorderCategoriesInput {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReorderItemInput)
  items!: ReorderItemInput[];
}

export class MergeCategoryInput {
  /** The concept that keeps the transactions; this one is removed. */
  @Type(() => Number)
  @IsInt()
  targetId!: number;
}

export class DeleteCategoryQuery {
  /**
   * Where the subtree's transactions go. Required when it has any: without
   * it the deletion is refused (409), never left to unclassify them silently.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  reassignTo?: number;
}
