import { ArrowRightLeft, Minus, Plus } from 'lucide-react';

import { DEFAULT_CURRENCY, formatCOP, formatMoney } from '@/shared/lib/format';
import { t } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';

/**
 * Where the money goes: it comes in, goes out or just moves between accounts.
 *
 * It is the only thing `Amount` needs to know, and it is not a domain type: whoever
 * has a transaction translates its `type` with `sentidoDelMovimiento`
 * (`features/transactions/model/transactions.ts`). That way `shared/ui` does not know
 * what a transaction is.
 */
export type MoneyDirection = 'in' | 'out' | 'transfer';

interface AmountProps {
  amount: string;
  /** ISO 4217 code of the movement; aggregates leave it out. */
  currency?: string;
  direction?: MoneyDirection;
  className?: string;
  /** Hides the icon when the context already makes the sign crystal clear. */
  isTextOnly?: boolean;
}

/**
 * Shows an amount with its semantics.
 *
 * Accessibility rule honored here: the state NEVER depends on
 * color alone. Each amount also carries a sign and an icon, so someone with color blindness
 * —or looking at a black-and-white printout— tells an income from an
 * expense just the same.
 *
 * Semantics: income = teal, expense = purple. Red is NOT used for expenses;
 * it is reserved for errors and destructive actions.
 */
export function Amount({
  amount,
  currency = DEFAULT_CURRENCY,
  direction = 'out',
  className,
  isTextOnly = false,
}: AmountProps) {
  const styles = {
    in: {
      color: 'text-income',
      sign: '+',
      Icon: Plus,
      label: t('transactions.types.income'),
    },
    out: {
      color: 'text-expense',
      sign: '−',
      Icon: Minus,
      label: t('transactions.types.expense'),
    },
    transfer: {
      color: 'text-muted-foreground',
      sign: '',
      Icon: ArrowRightLeft,
      label: t('transactions.types.transfer'),
    },
  }[direction];

  const { Icon } = styles;

  return (
    <span
      className={cn('tabular inline-flex items-center gap-1 font-medium', styles.color, className)}
    >
      {!isTextOnly && <Icon className="size-3.5 shrink-0" aria-hidden="true" />}
      <span className="sr-only">{styles.label}: </span>
      <span>
        {styles.sign}
        {formatMoney(amount, currency)}
      </span>
    </span>
  );
}

/**
 * Neutral amount for balances: no forced sign, but colored if negative.
 * A negative balance is marked in amber (attention), not in red: it is not a system
 * error, it is information.
 */
export function Balance({ amount, className }: { amount: string; className?: string }) {
  const value = Number.parseFloat(amount);
  const isNegative = Number.isFinite(value) && value < 0;

  return (
    <span className={cn('tabular font-medium', isNegative && 'text-warning', className)}>
      {formatCOP(amount)}
    </span>
  );
}
