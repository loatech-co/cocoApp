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
   * El mes al que PERTENECE el gasto, como YYYY-MM-DD del día 1.
   *
   * Opcional: si no viene, se asume el mes de `date`. Solo hace falta cuando el
   * gasto cruza de mes — la factura de marzo que se paga en abril.
   */
  @IsOptional()
  @IsDateString({}, { message: 'El periodo debe tener formato YYYY-MM-DD.' })
  period?: string;

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
   * ── Captura ──────────────────────────────────────────────────────────────
   * De dónde entra. La web manda `web`; la app del teléfono, uno de los
   * suyos. Decide si hay que buscar la otra cara de un mismo pago.
   */
  @IsOptional()
  @IsEnum(TransactionSource)
  source?: TransactionSource | undefined;

  /** El texto del que salió: el OCR del recibo, el SMS del banco. */
  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  raw_text?: string | null;

  /** Cuándo se capturó, ISO 8601 con zona. */
  @IsOptional()
  @IsISO8601()
  captured_at?: string | null;

  /** Si alguien tiene que mirarlo: clasificación insegura o posible duplicado. */
  @IsOptional()
  @IsBoolean()
  por_revisar?: boolean;

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
  /**
   * El mes al que PERTENECE el gasto, como YYYY-MM-DD del día 1.
   *
   * Opcional: si no viene, se asume el mes de `date`. Solo hace falta cuando el
   * gasto cruza de mes — la factura de marzo que se paga en abril.
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

  /**
   * ── Captura ──────────────────────────────────────────────────────────────
   * De dónde entra. La web manda `web`; la app del teléfono, uno de los
   * suyos. Decide si hay que buscar la otra cara de un mismo pago.
   */
  @IsOptional()
  @IsEnum(TransactionSource)
  source?: TransactionSource;

  /** El texto del que salió: el OCR del recibo, el SMS del banco. */
  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  raw_text?: string | null;

  /** Cuándo se capturó, ISO 8601 con zona. */
  @IsOptional()
  @IsISO8601()
  captured_at?: string | null;

  /** Si alguien tiene que mirarlo: clasificación insegura o posible duplicado. */
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
   * El mes al que PERTENECE el gasto, como YYYY-MM-DD del día 1.
   *
   * Opcional: si no viene, se asume el mes de `date`. Solo hace falta cuando el
   * gasto cruza de mes — la factura de marzo que se paga en abril.
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
   * Varios ids separados por coma: `?category_ids=3,7`. Cada uno arrastra su
   * rama entera. Convive con `category_id` para no romper enlaces guardados.
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
