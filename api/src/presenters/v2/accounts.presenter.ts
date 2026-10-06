import type { Account } from '../../modules/accounts/accounts.service';

/** v2 body of an account (see `transactions.presenter.ts`). */
export function accountV2(account: Account): Account {
  return account;
}
