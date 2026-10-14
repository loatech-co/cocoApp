import { useState } from 'react';

import { type PendingPayment } from '@/shared/api/generated/model';
import { formatCOP, shortDay } from '@/shared/lib/format';
import { t } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/atoms/button';
import { ExpandableRow, ExpandableRows, RowFacts } from '@/shared/ui/molecules/expandable-rows';

/**
 * The pending payments, on the phone: drawers like the rows of the table.
 *
 * A tap used to open the transaction sheet straight away, next to a table
 * whose rows unfold first. Here a row shows the concept and the amount, and
 * unfolds into the rest —where it goes, when it is due, what has been paid
 * of one paid in installments— and the one action: «Registrar pago», which
 * opens the sheet exactly as the tap did.
 *
 * ── Overdue stays visible closed ────────────────────────────────────────────
 * A dot in the warning color before the amount, named for the ear. Hiding
 * the due date behind a tap must not hide that it is late.
 *
 * No progress bar and no «Registrar otro» here: what was paid of a payment
 * in installments is one more fact of the open drawer, and every row has the
 * same single action.
 */
export function PhonePendingList({
  payments,
  now,
  onSelect,
}: {
  payments: PendingPayment[];
  now: string;
  onSelect: ((payment: PendingPayment) => void) | undefined;
}) {
  const [openId, setOpenId] = useState<number | null>(null);

  return (
    <ExpandableRows label={t('transactions.pending.title')}>
      {payments.map((payment) => (
        <PhonePendingRow
          key={payment.categoryId}
          payment={payment}
          isOverdue={payment.dueDate < now}
          isOpen={openId === payment.categoryId}
          onToggle={() => setOpenId(openId === payment.categoryId ? null : payment.categoryId)}
          onSelect={onSelect}
        />
      ))}
    </ExpandableRows>
  );
}

function PhonePendingRow({
  payment,
  isOverdue,
  isOpen,
  onToggle,
  onSelect,
}: {
  payment: PendingPayment;
  isOverdue: boolean;
  isOpen: boolean;
  onToggle: () => void;
  onSelect: ((payment: PendingPayment) => void) | undefined;
}) {
  return (
    <ExpandableRow
      surface="block"
      primary={<span className="block truncate font-medium">{payment.name}</span>}
      value={<PendingAmount payment={payment} isOverdue={isOverdue} />}
      isOpen={isOpen}
      onToggle={onToggle}
    >
      <RowFacts facts={pendingFacts(payment, isOverdue)} />

      {onSelect && (
        <Button type="button" className="w-full" onClick={() => onSelect(payment)}>
          {t('transactions.pending.registerPayment')}
        </Button>
      )}
    </ExpandableRow>
  );
}

/** The amount, with the overdue dot in front when it is late. */
function PendingAmount({ payment, isOverdue }: { payment: PendingPayment; isOverdue: boolean }) {
  return (
    <span className="flex items-center justify-end gap-2 font-semibold">
      {isOverdue && (
        <span
          role="img"
          aria-label={t('transactions.pending.overdue')}
          className="size-2 shrink-0 rounded-full bg-warning"
        />
      )}
      {payment.expectedAmount ? formatCOP(payment.expectedAmount) : null}
    </span>
  );
}

/** What the drawer tells: where it goes, when it is due, and what was paid of it. */
function pendingFacts(payment: PendingPayment, isOverdue: boolean) {
  return [
    {
      label: t('transactions.pending.classification'),
      // The server writes it «center · category»; here it reads as a path.
      value: payment.path.split(' · ').join(' › '),
    },
    {
      label: t('transactions.pending.due'),
      // Overdue in amber, not in red: it is owed, nothing went wrong.
      value: (
        <span className={cn('tabular', isOverdue && 'font-medium text-warning')}>
          {shortDay(payment.dueDate)}
        </span>
      ),
    },
    ...(payment.isMultiPayment && payment.expectedAmount
      ? [
          {
            label: t('transactions.pending.paid'),
            value: (
              <span className="tabular">
                {t('transactions.pending.paidOf', {
                  paid: formatCOP(payment.paidAmount),
                  expected: formatCOP(payment.expectedAmount),
                })}
              </span>
            ),
          },
        ]
      : []),
  ];
}
