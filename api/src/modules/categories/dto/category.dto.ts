import { CategoryKind, Periodicidad } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const HEX = /^#[0-9A-Fa-f]{6}$/;

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
   * ── Recurrencia ─────────────────────────────────────────────────────────
   * Marca el concepto como un pago que vuelve. `dia_de_pago` es el día del mes
   * en que se debe pagar; en los meses que no llegan a ese día se entiende el
   * último.
   */
  @IsOptional()
  @IsBoolean()
  recurrente?: boolean;

  /**
   * Lo que cuelga de un centro de costos ESTÁTICO no se reclasifica desde
   * ninguna pantalla de movimientos. Solo se lee del centro; en un grupo o un
   * concepto es inerte.
   */
  @IsOptional()
  @IsBoolean()
  estatico?: boolean;

  @IsOptional()
  @IsEnum(Periodicidad, { message: 'La periodicidad no es válida.' })
  periodicidad?: Periodicidad | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'El día de pago va del 1 al 31.' })
  @Max(31, { message: 'El día de pago va del 1 al 31.' })
  dia_de_pago?: number | null;

  /** El mes de referencia del ciclo. Solo cuando no es mensual. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'El mes va del 1 al 12.' })
  @Max(12, { message: 'El mes va del 1 al 12.' })
  mes_de_pago?: number | null;
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

  /** `null` explícito mueve la categoría a la raíz. */
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
   * ── Recurrencia ─────────────────────────────────────────────────────────
   * Marca el concepto como un pago que vuelve. `dia_de_pago` es el día del mes
   * en que se debe pagar; en los meses que no llegan a ese día se entiende el
   * último.
   */
  @IsOptional()
  @IsBoolean()
  recurrente?: boolean;

  /**
   * Lo que cuelga de un centro de costos ESTÁTICO no se reclasifica desde
   * ninguna pantalla de movimientos. Solo se lee del centro; en un grupo o un
   * concepto es inerte.
   */
  @IsOptional()
  @IsBoolean()
  estatico?: boolean;

  @IsOptional()
  @IsEnum(Periodicidad, { message: 'La periodicidad no es válida.' })
  periodicidad?: Periodicidad | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'El día de pago va del 1 al 31.' })
  @Max(31, { message: 'El día de pago va del 1 al 31.' })
  dia_de_pago?: number | null;

  /** El mes de referencia del ciclo. Solo cuando no es mensual. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'El mes va del 1 al 12.' })
  @Max(12, { message: 'El mes va del 1 al 12.' })
  mes_de_pago?: number | null;

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

export class UnificarCategoriaDto {
  /** El concepto que SOBREVIVE. El de la ruta es el que desaparece. */
  @Type(() => Number)
  @IsInt()
  destino_id!: number;
}
