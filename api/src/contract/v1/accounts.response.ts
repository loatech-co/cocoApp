import { ApiProperty } from '@nestjs/swagger';
import { AccountType } from '../../generated/prisma/client';

export class AccountResponse {
  id!: number;
  name!: string;
  @ApiProperty({ enum: AccountType })
  type!: AccountType;
  /** ISO 4217. */
  currency!: string;
  institution!: string | null;
  last4!: string | null;
  credit_limit!: string | null;
  cutoff_day!: number | null;
  payment_day!: number | null;
  opening_balance!: string;
  is_archived!: boolean;
  /** Derived from the transactions; not a column. */
  balance!: string;
  /** Includes `pending` transactions. */
  balance_projected!: string;
  /** Credit cards only: `credit_limit` minus what is owed. */
  available_credit!: string | null;
  created_at!: Date;
}
