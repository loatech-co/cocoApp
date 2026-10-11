import { Type } from 'class-transformer';
import { IsIn, IsISO8601, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

import { IfPresent } from '../../../../common/validation/if-present.decorator';
import { TRANSACTION_SOURCES } from '../../../../contract/v2/transactions.response';

export class InterpretInput {
  /** Free text: the OCR of a receipt, a bank SMS, what the user typed. */
  @IfPresent()
  @IsString()
  @MaxLength(20_000)
  text?: string;

  @IfPresent()
  @IsString()
  @MaxLength(255)
  merchant?: string;

  /** In pesos, up to two decimals; `.` or `,` as the separator. */
  @IfPresent()
  @Type(() => String)
  @Matches(/^\d+([.,]\d{1,2})?$/, { message: 'El monto va en pesos, con hasta dos decimales.' })
  amount?: string;

  /** `YYYY-MM-DD`. */
  @IfPresent()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La fecha va como YYYY-MM-DD.' })
  date?: string;

  /** Name of the file the text came from. */
  @IfPresent()
  @IsString()
  @MaxLength(255)
  fileName?: string;

  /** The month it belongs to, `YYYY-MM`. */
  @IfPresent()
  @Matches(/^\d{4}-\d{2}$/)
  period?: string;
}

export class CaptureInput extends InterpretInput {
  @IsIn(TRANSACTION_SOURCES)
  source!: (typeof TRANSACTION_SOURCES)[number];

  /**
   * The client's own id for this capture. Sending it again returns the
   * transaction already recorded (`isDuplicate: true`) instead of a second one,
   * so a retry after a lost answer is safe.
   */
  @IsString()
  @MaxLength(255)
  externalRef!: string;

  /** When it was captured, ISO 8601 with offset. */
  @IsOptional()
  @IsISO8601()
  capturedAt?: string;

  /** The concept the user chose: stored as is, not classified. Digits, as a string. */
  @IfPresent()
  @Matches(/^\d+$/)
  categoryId?: string;

  @IfPresent()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
