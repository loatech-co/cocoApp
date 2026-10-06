import { ApiProperty } from '@nestjs/swagger';

import {
  TransactionSource,
  TransactionStatus,
  TransactionType,
} from '../../generated/prisma/client';

export class SplitResponse {
  id!: number;
  category_id!: number | null;
  amount!: string;
  note!: string | null;
}

export class TransactionResponse {
  id!: number;
  uuid!: string;
  account_id!: number | null;
  /** `YYYY-MM-DD`. */
  date!: string;
  /** The month the transaction BELONGS to, as its first day (`YYYY-MM-DD`). */
  period!: string;
  amount!: string;
  /** ISO 4217 code of `amount`. */
  currency!: string;
  @ApiProperty({ enum: TransactionType })
  type!: TransactionType;
  category_id!: number | null;
  description!: string | null;
  merchant!: string | null;
  notes!: string | null;
  transfer_group_id!: string | null;
  @ApiProperty({ enum: ['out', 'in'], nullable: true })
  transfer_direction!: 'out' | 'in' | null;
  external_ref!: string | null;
  @ApiProperty({ enum: TransactionStatus })
  status!: TransactionStatus;
  @ApiProperty({ enum: TransactionSource })
  source!: TransactionSource;
  raw_text!: string | null;
  captured_at!: Date | null;
  por_revisar!: boolean;
  tags!: string[];
  splits!: SplitResponse[];
  created_at!: Date;
}

/** First and last date with transactions, `YYYY-MM-DD`; `null` when there are none. */
export class TransactionHistoryResponse {
  first!: string | null;
  last!: string | null;
}

export class TransferResponse {
  transfer_group_id!: string;
  /** The two legs: out of one account, into the other. */
  legs!: TransactionResponse[];
}
