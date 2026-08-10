import { TransactionStatus, TransactionType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { IsMoney, IsPositiveMoney } from '../../../common/validation/is-money.decorator';

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
   * OPCIONAL. Llevar cuentas es una función que se enciende en los ajustes, no
   * un requisito para registrar un gasto: pedirla aquí obligaría a inventarse
   * una cuenta antes de poder anotar el primer café.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  account_id?: number;

  @IsDateString({}, { message: 'La fecha debe tener formato YYYY-MM-DD.' })
  date!: string;

  /** Siempre positivo: el signo económico lo da `type`, no el número. */
  @IsPositiveMoney()
  amount!: string;

  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;

  /** Opcional a propósito: un movimiento puede existir sin categoría. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  category_id?: number;

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

  @IsOptional()
  @IsString()
  @MaxLength(255)
  external_ref?: string;

  /** Nombres, no ids: la UI las crea al vuelo. */
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

  /** `null` explícito quita la categoría. */
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

  /** Búsqueda de texto sobre description, merchant y notes. */
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

  /** Tope de 200: sin él, un cliente podría pedir años de historial de una. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  per_page?: number;

  /** `-campo` para descendente. Solo se aceptan campos de una lista blanca. */
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  sort?: string;
}
