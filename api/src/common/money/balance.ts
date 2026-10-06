import { ZERO, toMoney, type Money } from './money';
import type {
  AccountType,
  TransactionStatus,
  TransactionType,
  TransferDirection,
} from '../../generated/prisma/client';

/** The least of a transaction needed to compute a balance. */
export interface BalanceMovement {
  type: TransactionType;
  /** Only relevant when `type === 'transfer'`. */
  transferDir: TransferDirection | null;
  amount: Money;
  status: TransactionStatus;
}

export interface DerivedBalance {
  /** `cleared` transactions only. The balance the bank would confirm. */
  cleared: Money;
  /** Includes the `pending` ones. "How much I will have once everything lands". */
  projected: Money;
}

/** Credit accounts are a LIABILITY: the balance is debt, not money. */
const LIABILITY_TYPES: ReadonlySet<AccountType> = new Set<AccountType>(['credit']);

function isLiabilityAccount(type: AccountType): boolean {
  return LIABILITY_TYPES.has(type);
}

/**
 * The effect of a transaction on the balance of ONE asset account (cash,
 * debit, bank, savings, other).
 *
 *   income    → adds
 *   expense   → subtracts
 *   transfer  → adds if it comes in, subtracts if it goes out
 *
 * A transfer without a direction is corrupt data: there is no telling which
 * side the money is on, so it contributes zero instead of inventing a sign.
 */
function deltaAsAsset(movement: BalanceMovement): Money {
  switch (movement.type) {
    case 'income':
      return movement.amount;
    case 'expense':
      return movement.amount.negated();
    case 'transfer':
      if (movement.transferDir === 'in') return movement.amount;
      if (movement.transferDir === 'out') return movement.amount.negated();
      return ZERO;
  }
}

/**
 * Computes an account's DERIVED balance.
 *
 * There is no balance column in the database, on purpose: a stored balance
 * drifts the moment some write path forgets to update it, and then the figure
 * the user sees is no longer the real sum of their transactions. Here it is
 * always computed.
 *
 * On credit accounts the sign flips: the balance is what is OWED, so an
 * expense raises it and a payment (a transfer into the card) lowers it.
 */
export function computeBalance(
  accountType: AccountType,
  openingBalance: Money,
  movements: readonly BalanceMovement[],
): DerivedBalance {
  const isLiability = isLiabilityAccount(accountType);

  let cleared = toMoney(openingBalance);
  let projected = toMoney(openingBalance);

  for (const movement of movements) {
    const delta = isLiability ? deltaAsAsset(movement).negated() : deltaAsAsset(movement);

    projected = projected.plus(delta);
    if (movement.status === 'cleared') {
      cleared = cleared.plus(delta);
    }
  }

  return { cleared: toMoney(cleared), projected: toMoney(projected) };
}

/**
 * A card's available credit: `credit_limit − balance_owed`.
 *
 * It can go negative if the limit was exceeded. The system reports it and does
 * not block it: no rigidity.
 */
export function computeAvailableCredit(
  creditLimit: Money | null,
  balanceOwed: Money,
): Money | null {
  if (creditLimit === null) return null;
  return toMoney(creditLimit.minus(balanceOwed));
}
