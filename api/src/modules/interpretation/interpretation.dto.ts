import { Type } from 'class-transformer';
import { IsEnum, IsISO8601, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

import { TransactionSource } from '../../generated/prisma/client';

/**
 * What is given to interpret: free text, or data already structured.
 *
 * Both forms, because both exist: a receipt's OCR and the bank's SMS are
 * text; the Wallet trigger delivers merchant, amount and date already
 * separate. At least one of the two has to come; the service checks it,
 * since it is the one that knows what to do with each.
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

  /** As a decimal string. A number in the JSON is converted before validating. */
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

  /** `YYYY-MM`: the month it belongs to, to choose among a receipt's dates. */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}$/)
  periodo?: string;
}

/** The same, plus what it takes to SAVE it idempotently. */
export class CaptureBodyDto extends InterpretBodyDto {
  @IsEnum(TransactionSource)
  source!: TransactionSource;

  /**
   * The idempotency key. The client generates it when capturing —a UUID— and
   * repeats it when it retries: the second time it gets what was already
   * created.
   */
  @IsString()
  @MaxLength(255)
  external_ref!: string;

  /** When it was captured, ISO 8601 with a zone. Without it, now. */
  @IsOptional()
  @IsISO8601()
  captured_at?: string;

  /**
   * The concept —or the category— the person chose in the phone's quick
   * form. The choice WINS over whatever the engine proposes; with this and
   * the amount, no text or merchant is needed.
   *
   * It goes here and not in `POST /transactions` because the phone's queue
   * needs ONE idempotent endpoint —always 200, `repetido`, `resumen`— for all
   * its items. Sending the manual ones the other way would force reading the
   * unique index's 409 as a success and would split the queue in two.
   */
  @IsOptional()
  @Matches(/^\d+$/)
  category_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  nota?: string;
}
