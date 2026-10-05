import { ApiProperty } from '@nestjs/swagger';

export const TRANSACTION_TYPES = ['expense', 'income', 'transfer'] as const;
export const TRANSACTION_STATUSES = ['cleared', 'pending'] as const;
export const TRANSACTION_SOURCES = ['web', 'ios_manual', 'ios_photo', 'wallet', 'sms'] as const;

export class Split {
  id!: number;
  categoryId!: number | null;
  amount!: string;
  note!: string | null;
}

export class Transaction {
  id!: number;
  uuid!: string;
  accountId!: number | null;
  /** `YYYY-MM-DD`. */
  date!: string;
  /** The month the transaction BELONGS to, as its first day (`YYYY-MM-DD`). */
  period!: string;
  amount!: string;
  /** ISO 4217 code of `amount`. */
  currency!: string;
  @ApiProperty({ enum: TRANSACTION_TYPES })
  type!: (typeof TRANSACTION_TYPES)[number];
  categoryId!: number | null;
  description!: string | null;
  merchant!: string | null;
  notes!: string | null;
  transferGroupId!: string | null;
  @ApiProperty({ enum: ['out', 'in'], nullable: true })
  transferDirection!: 'out' | 'in' | null;
  /** The client's own id for this capture; a second capture with it returns this one. */
  externalRef!: string | null;
  @ApiProperty({ enum: TRANSACTION_STATUSES })
  status!: (typeof TRANSACTION_STATUSES)[number];
  @ApiProperty({ enum: TRANSACTION_SOURCES })
  source!: (typeof TRANSACTION_SOURCES)[number];
  rawText!: string | null;
  capturedAt!: Date | null;
  /** Someone has to look at it: an unsure classification or a possible duplicate. */
  needsReview!: boolean;
  tags!: string[];
  splits!: Split[];
  createdAt!: Date;
}

/** First and last date with transactions, `YYYY-MM-DD`; `null` when there are none. */
export class TransactionHistory {
  first!: string | null;
  last!: string | null;
}

export class Transfer {
  transferGroupId!: string;
  /** The two legs: out of one account, into the other. */
  legs!: Transaction[];
}
