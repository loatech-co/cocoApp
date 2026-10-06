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
import { unir } from '../palabras-clave';

const HEX = /^#[0-9A-Fa-f]{6}$/;

/**
 * Cuántas palabras clave admite un concepto y cuánto puede medir cada una.
 *
 * El tope no es un límite técnico: treinta palabras para reconocer un acreedor
 * ya no son señales, son una red que atrapa cualquier recibo. Y está aquí —en
 * el contrato— para que un cliente que no sea esta pantalla tampoco pueda
 * llenar la columna.
 */
export const MAXIMO_DE_PALABRAS = 30;
const LARGO_DE_UNA_PALABRA = 60;

/**
 * Limpia la lista antes de validarla: recorta, tira las vacías y quita las
 * repetidas sin mirar tildes ni mayúsculas.
 *
 * Se hace aquí y no en el servicio porque es parte de lo que significa el
 * campo, no de lo que se hace con él: «Claro» y «claro » son la misma palabra
 * dicha dos veces, y guardarlas las dos haría que el clasificador sumara
 * puntos dos veces por una sola coincidencia.
 *
 * Lo que no sea una lista de textos se devuelve intacto: rechazarlo es trabajo
 * de `@IsArray` y `@IsString`, que dan un mensaje que se entiende.
 */
function limpiarPalabras({ value }: { value: unknown }): unknown {
  if (!Array.isArray(value)) return value;
  if (value.some((palabra) => typeof palabra !== 'string')) return value;

  return unir(value as string[]);
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
   * ninguna pantalla de movimientos. Solo se lee del centro; en una categoría o un
   * concepto es inerte.
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

  /** El mes de referencia del ciclo. Solo cuando no es mensual. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'El mes va del 1 al 12.' })
  @Max(12, { message: 'El mes va del 1 al 12.' })
  mes_de_pago?: number | null;

  /**
   * ── Pago automático ─────────────────────────────────────────────────────
   * El concepto no espera a que nadie lo registre: al llegar su día de pago,
   * el movimiento se crea solo y deja de estar pendiente.
   *
   * Para lo que se cobra sin que uno haga nada —un débito, una suscripción—.
   * Solo desde el mes en que se enciende hacia adelante: nunca rellena meses
   * pasados.
   *
   * Solo significa algo en un concepto recurrente.
   */
  @IsOptional()
  @IsBoolean()
  pago_automatico?: boolean;

  /**
   * ── Se paga en varias veces ─────────────────────────────────────────────
   * El concepto no se salda con un pago: se va cubriendo. El mercado se hace
   * en cuatro idas, la gasolina en seis tanqueadas, y ninguna de esas idas
   * termina el mes.
   *
   * Marcado, el concepto se queda en pagos pendientes mientras lo pagado sea
   * menor que lo esperado, enseñando cuánto lleva.
   *
   * Tres condiciones, y las comprueba el servicio y no esto: tiene que ser un
   * CONCEPTO —el tercer nivel—, tiene que ser RECURRENTE, y no puede llevar
   * también «pago automático». Las tres hablan de cómo queda la fila después
   * de aplicar el cambio, y aquí solo se ve lo que trajo la petición.
   */
  @IsOptional()
  @IsBoolean()
  varios_pagos?: boolean;

  /**
   * ── Presupuesto ─────────────────────────────────────────────────────────
   * Lo que se espera que cueste cada vez que toca. Puesto, MANDA: la previsión
   * del mes es este número y no el promedio de lo que costó antes.
   *
   * Es para los gastos cuyo valor se sabe —un alquiler con contrato, una
   * mensualidad— donde promediar da una cifra peor que el dato. Vacío se sigue
   * promediando, que es lo correcto para lo que varía de verdad.
   *
   * Cero es un valor, no un hueco: dice «esto ahora no cuesta». Para quitarlo
   * se manda `null`.
   *
   * Solo significa algo en un concepto recurrente.
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'El presupuesto admite hasta dos decimales.' })
  @Min(0, { message: 'El presupuesto no puede ser negativo.' })
  @Max(9_999_999_999_999, { message: 'Ese presupuesto es demasiado grande.' })
  presupuesto?: number | null;

  /**
   * ── Palabras clave ──────────────────────────────────────────────────────
   * Lo que se busca en el texto de un soporte para reconocer este concepto.
   * Solo significan algo en un concepto: un centro de costos y una categoría no
   * aparecen en ninguna factura.
   */
  @IsOptional()
  @Transform(limpiarPalabras)
  @IsArray()
  @ArrayMaxSize(MAXIMO_DE_PALABRAS, {
    message: `Un concepto admite hasta ${MAXIMO_DE_PALABRAS} palabras clave.`,
  })
  @IsString({ each: true })
  @MaxLength(LARGO_DE_UNA_PALABRA, { each: true })
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
   * ninguna pantalla de movimientos. Solo se lee del centro; en una categoría o un
   * concepto es inerte.
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

  /** El mes de referencia del ciclo. Solo cuando no es mensual. */
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
   * ── Se paga en varias veces ─────────────────────────────────────────────
   * El concepto no se salda con un pago: se va cubriendo. El mercado se hace
   * en cuatro idas, la gasolina en seis tanqueadas, y ninguna de esas idas
   * termina el mes.
   *
   * Marcado, el concepto se queda en pagos pendientes mientras lo pagado sea
   * menor que lo esperado, enseñando cuánto lleva.
   *
   * Tres condiciones, y las comprueba el servicio y no esto: tiene que ser un
   * CONCEPTO —el tercer nivel—, tiene que ser RECURRENTE, y no puede llevar
   * también «pago automático». Las tres hablan de cómo queda la fila después
   * de aplicar el cambio, y aquí solo se ve lo que trajo la petición.
   */
  @IsOptional()
  @IsBoolean()
  varios_pagos?: boolean;

  /** Ver `CreateCategoryDto`. `null` lo quita; cero es un valor. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'El presupuesto admite hasta dos decimales.' })
  @Min(0, { message: 'El presupuesto no puede ser negativo.' })
  @Max(9_999_999_999_999, { message: 'Ese presupuesto es demasiado grande.' })
  presupuesto?: number | null;

  /** Ver `CreateCategoryDto`. Una lista vacía las borra todas. */
  @IsOptional()
  @Transform(limpiarPalabras)
  @IsArray()
  @ArrayMaxSize(MAXIMO_DE_PALABRAS, {
    message: `Un concepto admite hasta ${MAXIMO_DE_PALABRAS} palabras clave.`,
  })
  @IsString({ each: true })
  @MaxLength(LARGO_DE_UNA_PALABRA, { each: true })
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

export class UnificarCategoriaDto {
  /** El concepto que SOBREVIVE. El de la ruta es el que desaparece. */
  @Type(() => Number)
  @IsInt()
  destino_id!: number;
}
