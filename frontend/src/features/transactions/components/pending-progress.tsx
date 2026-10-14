import { type PendingPayment } from '@/shared/api/generated/model';
import { formatCOP } from '@/shared/lib/format';
import { t } from '@/shared/lib/i18n';
import { Progress } from '@/shared/ui/atoms/progress';

/**
 * How much it has covered so far, for those paid in several installments.
 *
 * It is `null` when there is no total to reach: with no expected value there
 * is no fraction to paint, and a bar without a denominator is a
 * bar that lies. Those are painted like any other pending payment.
 */
export function progressOf(payment: PendingPayment): number | null {
  const total = Number(payment.expectedAmount ?? 0);
  const paidSoFar = Number(payment.paidAmount);
  return payment.isMultiPayment && total > 0 ? paidSoFar / total : null;
}

/** What a payment made in several installments has covered so far. */
export function PendingProgress({
  payment,
  progress,
  hasAction,
}: {
  payment: PendingPayment;
  progress: number | null;
  hasAction: boolean;
}) {
  if (progress === null) return null;
  return (
    <span className="block w-full">
      <Progress
        value={progress}
        label={t('transactions.pending.progressLabel', {
          name: payment.name,
          paid: formatCOP(payment.paidAmount),
          expected: formatCOP(payment.expectedAmount ?? '0'),
        })}
        className="h-1"
      />
      <span className="mt-1.5 flex items-baseline justify-between gap-2 text-xs">
        <span className="tabular min-w-0 truncate text-muted-foreground">
          {t('transactions.pending.soFar', { amount: formatCOP(payment.paidAmount) })}
        </span>
        {hasAction && (
          <span className="shrink-0 font-medium text-accent-ink">
            {t('transactions.sheet.registerAnother')}
          </span>
        )}
      </span>
    </span>
  );
}
