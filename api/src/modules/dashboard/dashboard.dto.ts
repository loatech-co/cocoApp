import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/**
 * Los mismos filtros que la lista de movimientos, a propósito.
 *
 * El resumen y la lista son dos vistas del MISMO recorte: quien filtra por
 * "Servicios públicos" en el resumen y salta a movimientos espera ver esos
 * movimientos, no todos. Dos juegos de filtros distintos garantizarían que las
 * cifras de una pantalla no expliquen las de la otra.
 */
export class DashboardQueryDto {
  /** Inicio del rango, inclusive. Por defecto, el 1 del mes en curso. */
  @IsOptional()
  @IsDateString({}, { message: 'La fecha desde debe tener formato YYYY-MM-DD.' })
  from?: string;

  /** Fin del rango, inclusive. Por defecto, hoy. */
  @IsOptional()
  @IsDateString({}, { message: 'La fecha hasta debe tener formato YYYY-MM-DD.' })
  to?: string;

  /** Centro de costos, categoría o concepto. Incluye toda su rama. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  category_id?: number;

  /** Varios, separados por coma. Cada uno arrastra su rama entera. */
  @IsOptional()
  @IsString()
  @Matches(/^\d+(,\d+)*$/, {
    message: 'Las categorías deben ser números separados por coma.',
  })
  category_ids?: string;

  /** Busca en descripción, comercio y notas. Sin distinguir mayúsculas. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  q?: string;
}
