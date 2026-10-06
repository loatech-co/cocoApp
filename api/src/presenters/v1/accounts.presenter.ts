import type { Account } from '../../modules/accounts/accounts.service';

export interface AccountV1 {
  id: bigint;
  name: string;
  type: Account['type'];
  currency: string;
  institution: string | null;
  last4: string | null;
  credit_limit: string | null;
  cutoff_day: number | null;
  payment_day: number | null;
  opening_balance: string;
  is_archived: boolean;
  balance: string;
  balance_projected: string;
  available_credit: string | null;
  created_at: Date;
}

export function accountV1(a: Account): AccountV1 {
  return {
    id: a.id,
    name: a.name,
    type: a.type,
    currency: a.currency,
    institution: a.institution,
    last4: a.last4,
    credit_limit: a.creditLimit,
    cutoff_day: a.cutoffDay,
    payment_day: a.paymentDay,
    opening_balance: a.openingBalance,
    is_archived: a.isArchived,
    balance: a.balance,
    balance_projected: a.balanceProjected,
    available_credit: a.availableCredit,
    created_at: a.createdAt,
  };
}
