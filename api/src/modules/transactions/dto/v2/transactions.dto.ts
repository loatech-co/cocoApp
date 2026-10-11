import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { IfPresent } from '../../../../common/validation/if-present.decorator';
import { IsMoney, IsPositiveMoney } from '../../../../common/validation/is-money.decorator';
import { PageQuery } from '../../../../contract/v2/page.dto';
import {
  TRANSACTION_SOURCES,
  TRANSACTION_STATUSES,
  TRANSACTION_TYPES,
} from '../../../../contract/v2/transactions.response';

type TransactionType = (typeof TRANSACTION_TYPES)[number];
type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];
type TransactionSource = (typeof TRANSACTION_SOURCES)[number];

class SplitInput {
  @IfPresent()
  @Type(() => Number)
  @IsInt()
  categoryId?: number;

  @IsPositiveMoney()
  amount!: string;

  @IfPresent()
  @IsString()
  @MaxLength(255)
  note?: string;
}

/** What a transaction may carry, created or edited. Every field the same in both. */
class TransactionFields {
  /**
   * The month the transaction BELONGS to, as `YYYY-MM-DD`: any day of it is
   * accepted and stored as its first day. Absent, it is the month of `date`;
   * it differs when a bill crosses months.
   */
  @IfPresent()
  @IsDateString({}, { message: 'El periodo debe tener formato YYYY-MM-DD.' })
  period?: string;

  /** The text it came from: the OCR of a receipt, a bank SMS. */
  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  rawText?: string | null;

  /** When it was captured, ISO 8601 with offset. */
  @IsOptional()
  @IsISO8601()
  capturedAt?: string | null;

  /** Someone has to look at it: an unsure classification or a possible duplicate. */
  @IfPresent()
  @IsBoolean()
  needsReview?: boolean;

  @IfPresent()
  @IsIn(TRANSACTION_TYPES)
  type?: TransactionType;

  @IfPresent()
  @IsIn(TRANSACTION_STATUSES)
  status?: TransactionStatus;

  /** Where it comes from: the web sends `web`, the phone app one of its own. */
  @IfPresent()
  @IsIn(TRANSACTION_SOURCES)
  source?: TransactionSource;

  /** `null` clears it. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  merchant?: string | null;

  /** `null` clears it. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string | null;

  /** `null` clears it. */
  @IsOptional()
  @IsString()
  notes?: string | null;

  /** Names, not ids: the tags are created on the fly. */
  @IfPresent()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  tags?: string[];

  @IfPresent()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => SplitInput)
  splits?: SplitInput[];
}

export class CreateTransactionInput extends TransactionFields {
  @IsDateString({}, { message: 'La fecha debe tener formato YYYY-MM-DD.' })
  date!: string;

  /** Always positive: `type` gives the sign. */
  @IsPositiveMoney()
  amount!: string;

  /** Optional: keeping accounts is a setting, not a requirement. */
  @IfPresent()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  accountId?: number;

  /** Optional: a transaction may exist without a category; `null` says so too. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  categoryId?: number | null;

  /**
   * The client's own id, unique per user: a repeat here is a 409. To retry
   * safely, capture through `POST /transactions/capture`, which returns the
   * transaction already recorded.
   */
  @IfPresent()
  @IsString()
  @MaxLength(255)
  externalRef?: string;
}

export class UpdateTransactionInput extends TransactionFields {
  @IfPresent()
  @IsDateString()
  date?: string;

  @IfPresent()
  @IsPositiveMoney()
  amount?: string;

  @IfPresent()
  @Type(() => Number)
  @IsInt()
  accountId?: number;

  /** `null` removes the category. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  categoryId?: number | null;
}

export class CreateTransferInput {
  /** The month the transfer BELONGS to, as `YYYY-MM-DD`; stored as its first day. */
  @IfPresent()
  @IsDateString({}, { message: 'El periodo debe tener formato YYYY-MM-DD.' })
  period?: string;

  @Type(() => Number)
  @IsInt()
  fromAccountId!: number;

  @Type(() => Number)
  @IsInt()
  toAccountId!: number;

  @IsDateString()
  date!: string;

  @IsPositiveMoney()
  amount!: string;

  @IfPresent()
  @IsString()
  @MaxLength(255)
  description?: string;
}

export class ListTransactionsQuery extends PageQuery {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  accountId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  categoryId?: number;

  /** Several ids, comma separated: `?categoryIds=3,7`. Each brings its whole branch. */
  @IsOptional()
  @IsString()
  @Matches(/^\d+(,\d+)*$/, { message: 'Las categorías deben ser números separados por coma.' })
  categoryIds?: string;

  @IsOptional()
  @IsIn(TRANSACTION_TYPES)
  type?: TransactionType;

  @IsOptional()
  @IsIn(TRANSACTION_STATUSES)
  status?: TransactionStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  tagId?: number;

  /** Text search over description, merchant and notes. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  q?: string;

  @IsOptional()
  @IsMoney()
  minAmount?: string;

  @IsOptional()
  @IsMoney()
  maxAmount?: string;

  /** `date`, `amount`, `createdAt` or `merchant`; `-` in front for descending. */
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  sort?: string;
}
