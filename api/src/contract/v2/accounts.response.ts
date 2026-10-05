import { ApiProperty } from '@nestjs/swagger';

export const ACCOUNT_TYPES = ['cash', 'debit', 'credit', 'bank', 'savings', 'other'] as const;

export class Account {
  id!: number;
  name!: string;
  @ApiProperty({ enum: ACCOUNT_TYPES })
  type!: (typeof ACCOUNT_TYPES)[number];
  /** ISO 4217. */
  currency!: string;
  institution!: string | null;
  last4!: string | null;
  creditLimit!: string | null;
  cutoffDay!: number | null;
  paymentDay!: number | null;
  openingBalance!: string;
  isArchived!: boolean;
  /** Derived from the transactions; not a column. */
  balance!: string;
  /** Includes `pending` transactions. */
  balanceProjected!: string;
  /** Credit cards only: `creditLimit` minus what is owed. */
  availableCredit!: string | null;
  createdAt!: Date;
}
