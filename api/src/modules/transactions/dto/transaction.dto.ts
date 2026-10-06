import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { IsMoney, IsPositiveMoney } from '../../../common/validation/is-money.decorator';
import {
  TransactionSource,
  TransactionStatus,
  TransactionType,
} from '../../../generated/prisma/client';

export class SplitDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  category_id?: number;

  @IsPositiveMoney()
  amount!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;
}

export class CreateTransactionDto {
  /**
   * The month the expense BELONGS to, as the YYYY-MM-DD of day 1.
   *
   * Optional: when absent, the month of `date` is assumed. Only needed when
   * the expense crosses months — March's bill paid in April.
   */
  @IsOptional()
  @IsDateString({}, { message: 'El periodo debe tener formato YYYY-MM-DD.' })
  period?: string;

  /**
   * OPTIONAL. Tracking accounts is a feature turned on in the settings, not a
   * requirement to record an expense: asking for it here would force inventing
   * an account before jotting down the first coffee.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  account_id?: number;

  @IsDateString({}, { message: 'La fecha debe tener formato YYYY-MM-DD.' })
  date!: string;

  /** Always positive: the economic sign comes from `type`, not from the number. */
  @IsPositiveMoney()
  amount!: string;

  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;

  /** Optional on purpose: a transaction can exist without a category. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  category_id?: number | undefined;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string | undefined;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  merchant?: string | undefined;

  @IsOptional()
  @IsString()
  notes?: string | undefined;

  @IsOptional()
  @IsEnum(TransactionStatus)
  status?: TransactionStatus;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  external_ref?: string | undefined;

  /**
   * ── Capture ──────────────────────────────────────────────────────────────
   * Where it comes in from. The web sends `web`; the phone app, one of its
   * own. It decides whether to look for the other face of the same payment.
   */
  @IsOptional()
  @IsEnum(TransactionSource)
  source?: TransactionSource | undefined;

  /** The text it came from: the receipt's OCR, the bank's SMS. */
  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  raw_text?: string | null;

  /** When it was captured, ISO 8601 with zone. */
  @IsOptional()
  @IsISO8601()
  captured_at?: string | null;

  /** Whether someone has to look at it: unsure classification or possible duplicate. */
  @IsOptional()
  @IsBoolean()
  por_revisar?: boolean;

  /** Names, not ids: the UI creates them on the fly. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => SplitDto)
  splits?: SplitDto[];
}

export class UpdateTransactionDto {
  /**
   * The month the expense BELONGS to, as the YYYY-MM-DD of day 1.
   *
   * Optional: when absent, the month of `date` is assumed. Only needed when
   * the expense crosses months — March's bill paid in April.
   */
  @IsOptional()
  @IsDateString({}, { message: 'El periodo debe tener formato YYYY-MM-DD.' })
  period?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  account_id?: number;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsPositiveMoney()
  amount?: string;

  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;

  /** An explicit `null` removes the category. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  category_id?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  merchant?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsEnum(TransactionStatus)
  status?: TransactionStatus;

  /**
   * ── Capture ──────────────────────────────────────────────────────────────
   * Where it comes in from. The web sends `web`; the phone app, one of its
   * own. It decides whether to look for the other face of the same payment.
   */
  @IsOptional()
  @IsEnum(TransactionSource)
  source?: TransactionSource;

  /** The text it came from: the receipt's OCR, the bank's SMS. */
  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  raw_text?: string | null;

  /** When it was captured, ISO 8601 with zone. */
  @IsOptional()
  @IsISO8601()
  captured_at?: string | null;

  /** Whether someone has to look at it: unsure classification or possible duplicate. */
  @IsOptional()
  @IsBoolean()
  por_revisar?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => SplitDto)
  splits?: SplitDto[];
}

export class CreateTransferDto {
  /**
   * The month the expense BELONGS to, as the YYYY-MM-DD of day 1.
   *
   * Optional: when absent, the month of `date` is assumed. Only needed when
   * the expense crosses months — March's bill paid in April.
   */
  @IsOptional()
  @IsDateString({}, { message: 'El periodo debe tener formato YYYY-MM-DD.' })
  period?: string;

  @Type(() => Number)
  @IsInt()
  from_account_id!: number;

  @Type(() => Number)
  @IsInt()
  to_account_id!: number;

  @IsDateString()
  date!: string;

  @IsPositiveMoney()
  amount!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}

export class ListTransactionsQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  account_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  category_id?: number;

  /**
   * Several comma-separated ids: `?category_ids=3,7`. Each one brings its
   * whole branch. Lives alongside `category_id` so saved links do not break.
   */
  @IsOptional()
  @IsString()
  @Matches(/^\d+(,\d+)*$/, {
    message: 'Las categorías deben ser números separados por coma.',
  })
  category_ids?: string;

  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;

  @IsOptional()
  @IsEnum(TransactionStatus)
  status?: TransactionStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  tag_id?: number;

  /** Text search over description, merchant and notes. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  q?: string;

  @IsOptional()
  @IsMoney()
  min_amount?: string;

  @IsOptional()
  @IsMoney()
  max_amount?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  /** Capped at 200: without it, a client could ask for years of history at once. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  per_page?: number;

  /** `-field` for descending. Only fields from an allowlist are accepted. */
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  sort?: string;
}
