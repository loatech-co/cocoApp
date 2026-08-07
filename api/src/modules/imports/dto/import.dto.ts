import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { IsMoney } from '../../../common/validation/is-money.decorator';

/**
 * Tope de filas por lote.
 *
 * Un extracto mensual de una persona rara vez pasa de doscientos movimientos.
 * El tope no es una limitación del producto: es lo que impide que una petición
 * malformada —o intencionada— pida crear cien mil filas de una vez.
 */
export const MAXIMO_DE_FILAS = 500;

export class ImportRowInputDto {
  @IsISO8601({ strict: true }, { message: 'La fecha debe ser YYYY-MM-DD.' })
  date!: string;

  /** String decimal, nunca number: ver la regla de dinero del proyecto. */
  @IsMoney()
  amount!: string;

  @IsEnum(['expense', 'income', 'transfer'])
  type!: 'expense' | 'income' | 'transfer';

  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  description?: string;
}

export class CreateImportDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  account_id!: number;

  @IsEnum(['image', 'pdf', 'manual'])
  source!: 'image' | 'pdf' | 'manual';

  /** Nombre del archivo, para reconocer el lote. NUNCA su contenido. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  label?: string;

  /** Qué implementación de OcrProvider lo produjo. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  ocr_provider?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'No hay ningún movimiento que importar.' })
  @ArrayMaxSize(MAXIMO_DE_FILAS, {
    message: `Un lote no puede traer más de ${MAXIMO_DE_FILAS} movimientos.`,
  })
  @ValidateNested({ each: true })
  @Type(() => ImportRowInputDto)
  rows!: ImportRowInputDto[];
}

/**
 * Edición de una fila durante la revisión.
 *
 * Todo es opcional: se corrige lo que haga falta y nada más. Es la pantalla
 * donde la persona arregla lo que el OCR leyó mal, así que tiene que dejar
 * tocar cualquier campo.
 */
export class UpdateImportRowDto {
  @IsOptional()
  @IsISO8601({ strict: true })
  date?: string;

  @IsOptional()
  @IsMoney()
  amount?: string;

  @IsOptional()
  @IsEnum(['expense', 'income', 'transfer'])
  type?: 'expense' | 'income' | 'transfer';

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  /** `null` explícito quita la categoría: un movimiento sin categoría es válido. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  category_id?: number | null;

  @IsOptional()
  @IsEnum(['pending', 'accepted', 'duplicate', 'skipped'])
  status?: 'pending' | 'accepted' | 'duplicate' | 'skipped';
}
