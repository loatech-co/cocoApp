import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
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

import { SPANISH_PERIODICITIES, type SpanishPeriodicity } from '../../../common/vocabulary';
import { CategoryKind } from '../../../generated/prisma/client';
import { mergeKeywords } from '../keywords';

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
const MAX_KEYWORD_LENGTH = 60;

/**
 * Cleans the list before validating it: trims, drops the empty ones and
 * removes repeats regardless of accents and case.
 *
 * It is done here and not in the service because it is part of what the field
 * means, not of what is done with it: «Claro» and «claro » are the same word
 * said twice, and keeping both would make the classifier score twice for a
 * single match.
 *
 * What is not a list of strings is returned untouched: rejecting it is the job
 * of `@IsArray` and `@IsString`, which give a message that makes sense.
 */
function cleanKeywords({ value }: { value: unknown }): unknown {
  if (!Array.isArray(value)) return value;
  if (value.some((word) => typeof word !== 'string')) return value;

  return mergeKeywords(value as string[]);
}

export class CreateCategoryDto {
  @IsString()
  @MinLength(1, { message: 'El nombre no puede estar vacío.' })
  @MaxLength(255)
  name!: string;

  @IsEnum(CategoryKind, { message: 'El tipo de categoría no es válido.' })
  kind!: CategoryKind;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  parent_id?: number;

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
  sort_order?: number;

  /**
   * ── Recurrence ──────────────────────────────────────────────────────────
   * Marks the concept as a payment that comes back. `dia_de_pago` is the day
   * of the month it is due; in months that do not reach that day, the last one
   * is meant.
   */
  @IsOptional()
  @IsBoolean()
  recurrente?: boolean;

  /**
   * What hangs from a STATIC cost center is not reclassified from any
   * transactions screen. It is only read from the cost center; on a category
   * or a concept it does nothing.
   */
  @IsOptional()
  @IsBoolean()
  estatico?: boolean;

  @IsOptional()
  @IsIn(SPANISH_PERIODICITIES, { message: 'La periodicidad no es válida.' })
  periodicidad?: SpanishPeriodicity | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'El día de pago va del 1 al 31.' })
  @Max(31, { message: 'El día de pago va del 1 al 31.' })
  dia_de_pago?: number | null;

  /** The reference month of the cycle. Only when it is not monthly. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'El mes va del 1 al 12.' })
  @Max(12, { message: 'El mes va del 1 al 12.' })
  mes_de_pago?: number | null;

  /**
   * ── Automatic payment ───────────────────────────────────────────────────
   * The concept does not wait for anyone to record it: when its payment day
   * comes, the transaction is created on its own and stops being pending.
   *
   * For what is charged without anyone doing anything —a direct debit, a
   * subscription—. Only from the month it is turned on onwards: it never fills
   * past months.
   *
   * It only means something on a recurring concept.
   */
  @IsOptional()
  @IsBoolean()
  pago_automatico?: boolean;

  /**
   * ── Paid in several installments ────────────────────────────────────────
   * The concept is not settled with one payment: it is covered bit by bit.
   * Groceries take four trips, fuel six fill-ups, and none of those trips
   * closes the month.
   *
   * When flagged, the concept stays in pending payments while what was paid is
   * less than what was expected, showing how much it has so far.
   *
   * Three conditions, and the service checks them, not this: it has to be a
   * CONCEPT —the third level—, it has to be RECURRING, and it cannot also
   * carry «pago automático». All three are about how the row ends up after the
   * change, and here only the request is visible.
   */
  @IsOptional()
  @IsBoolean()
  varios_pagos?: boolean;

  /**
   * ── Budget ──────────────────────────────────────────────────────────────
   * What it is expected to cost each time it comes due. When set, it RULES:
   * the month's forecast is this number and not the average of what it cost
   * before.
   *
   * It is for the expenses whose amount is known —a rent with a contract, a
   * monthly fee— where averaging gives a worse figure than the datum. Empty,
   * it keeps averaging, which is right for what really varies.
   *
   * Zero is a value, not a gap: it says «this costs nothing now». To clear it,
   * send `null`.
   *
   * It only means something on a recurring concept.
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'El presupuesto admite hasta dos decimales.' })
  @Min(0, { message: 'El presupuesto no puede ser negativo.' })
  @Max(9_999_999_999_999, { message: 'Ese presupuesto es demasiado grande.' })
  presupuesto?: number | null;

  /**
   * ── Keywords ────────────────────────────────────────────────────────────
   * What is searched for in a receipt's text to recognize this concept. They
   * only mean something on a concept: a cost center and a category do not
   * appear on any bill.
   */
  @IsOptional()
  @Transform(cleanKeywords)
  @IsArray()
  @ArrayMaxSize(MAX_KEYWORDS, {
    message: `Un concepto admite hasta ${MAX_KEYWORDS} palabras clave.`,
  })
  @IsString({ each: true })
  @MaxLength(MAX_KEYWORD_LENGTH, { each: true })
  palabras_clave?: string[];
}

export class UpdateCategoryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsEnum(CategoryKind)
  kind?: CategoryKind;

  /** An explicit `null` moves the category to the root. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  parent_id?: number | null;

  @IsOptional()
  @Matches(HEX)
  color?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  icon?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sort_order?: number;

  @IsOptional()
  @IsBoolean()
  is_archived?: boolean;

  /**
   * ── Recurrence ──────────────────────────────────────────────────────────
   * Marks the concept as a payment that comes back. `dia_de_pago` is the day
   * of the month it is due; in months that do not reach that day, the last one
   * is meant.
   */
  @IsOptional()
  @IsBoolean()
  recurrente?: boolean;

  /**
   * What hangs from a STATIC cost center is not reclassified from any
   * transactions screen. It is only read from the cost center; on a category
   * or a concept it does nothing.
   */
  @IsOptional()
  @IsBoolean()
  estatico?: boolean;

  @IsOptional()
  @IsIn(SPANISH_PERIODICITIES, { message: 'La periodicidad no es válida.' })
  periodicidad?: SpanishPeriodicity | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'El día de pago va del 1 al 31.' })
  @Max(31, { message: 'El día de pago va del 1 al 31.' })
  dia_de_pago?: number | null;

  /** The reference month of the cycle. Only when it is not monthly. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'El mes va del 1 al 12.' })
  @Max(12, { message: 'El mes va del 1 al 12.' })
  mes_de_pago?: number | null;

  /** Ver `CreateCategoryDto`. */
  @IsOptional()
  @IsBoolean()
  pago_automatico?: boolean;

  /**
   * ── Paid in several installments ────────────────────────────────────────
   * The concept is not settled with one payment: it is covered bit by bit.
   * Groceries take four trips, fuel six fill-ups, and none of those trips
   * closes the month.
   *
   * When flagged, the concept stays in pending payments while what was paid is
   * less than what was expected, showing how much it has so far.
   *
   * Three conditions, and the service checks them, not this: it has to be a
   * CONCEPT —the third level—, it has to be RECURRING, and it cannot also
   * carry «pago automático». All three are about how the row ends up after the
   * change, and here only the request is visible.
   */
  @IsOptional()
  @IsBoolean()
  varios_pagos?: boolean;

  /** See `CreateCategoryDto`. `null` clears it; zero is a value. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'El presupuesto admite hasta dos decimales.' })
  @Min(0, { message: 'El presupuesto no puede ser negativo.' })
  @Max(9_999_999_999_999, { message: 'Ese presupuesto es demasiado grande.' })
  presupuesto?: number | null;

  /** See `CreateCategoryDto`. An empty list deletes them all. */
  @IsOptional()
  @Transform(cleanKeywords)
  @IsArray()
  @ArrayMaxSize(MAX_KEYWORDS, {
    message: `Un concepto admite hasta ${MAX_KEYWORDS} palabras clave.`,
  })
  @IsString({ each: true })
  @MaxLength(MAX_KEYWORD_LENGTH, { each: true })
  palabras_clave?: string[];
}

export class ListCategoriesQueryDto {
  @IsOptional()
  @IsEnum(CategoryKind)
  kind?: CategoryKind;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  include_archived?: boolean;
}

export class ReorderItemDto {
  @Type(() => Number)
  @IsInt()
  id!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  sort_order!: number;
}

export class ReorderCategoriesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReorderItemDto)
  items!: ReorderItemDto[];
}

export class MergeCategoryDto {
  /** The concept that SURVIVES. The one in the route is the one that goes away. */
  @Type(() => Number)
  @IsInt()
  destino_id!: number;
}
