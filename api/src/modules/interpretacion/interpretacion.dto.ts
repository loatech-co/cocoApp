import { TransactionSource } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsISO8601, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/**
 * Lo que se le da a interpretar: texto libre, o datos ya estructurados.
 *
 * Las dos formas, porque las dos existen: el OCR de un recibo y el SMS del
 * banco son texto; el disparador de Wallet entrega comercio, monto y fecha ya
 * separados. Al menos una de las dos tiene que venir; eso lo comprueba el
 * servicio, que es quien sabe qué hacer con cada una.
 */
export class InterpretBodyDto {
  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  texto?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  comercio?: string;

  /** Como cadena decimal. Un número en el JSON se convierte antes de validar. */
  @IsOptional()
  @Type(() => String)
  @Matches(/^\d+([.,]\d{1,2})?$/, { message: 'El monto va en pesos, con hasta dos decimales.' })
  monto?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La fecha va como YYYY-MM-DD.' })
  fecha?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  nombre_de_archivo?: string;

  /** `YYYY-MM`: el mes al que pertenece, para elegir entre las fechas de un recibo. */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}$/)
  periodo?: string;
}

/** Lo mismo, más lo que hace falta para GUARDARLO de forma idempotente. */
export class CaptureBodyDto extends InterpretBodyDto {
  @IsEnum(TransactionSource)
  source!: TransactionSource;

  /**
   * La llave de la idempotencia. El cliente la genera al capturar —un UUID—
   * y la repite si reintenta: la segunda vez recibe lo que ya se creó.
   */
  @IsString()
  @MaxLength(255)
  external_ref!: string;

  /** Cuándo se capturó, ISO 8601 con zona. Sin él, ahora. */
  @IsOptional()
  @IsISO8601()
  captured_at?: string;
}
