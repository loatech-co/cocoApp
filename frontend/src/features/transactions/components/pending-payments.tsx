import { Filter } from 'lucide-react';
import { useState, type Dispatch, type SetStateAction } from 'react';

import { type PendingPayment } from '@/shared/api/generated/model';
import { shortDay, formatCOP } from '@/shared/lib/format';
import { t } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { Card, CardContent } from '@/shared/ui/atoms/card';
import { CardRow } from '@/shared/ui/atoms/card-row';
import { Checkbox } from '@/shared/ui/atoms/checkbox';
import { Progress } from '@/shared/ui/atoms/progress';
import { HIGHLIGHT } from '@/shared/ui/foundations/surface';
import { Menu, MenuTitle } from '@/shared/ui/molecules/menu';

/** Today in America/Bogota, to know what is already overdue. */
function today(): string {
  return new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * What is left to pay this month.
 *
 * ── Why it is the concepts and not transactions ─────────────────────────────
 * Because a pending payment is, by definition, a transaction that DOES NOT EXIST. It
 * is deduced from the concepts marked as recurring: if it is due this month and there is
 * no transaction of its own in the period, it is missing.
 *
 * ── Why the current month and not the range above ──────────────────────────
 * Because "what do I still have to pay?" is always a question about today. Reviewing
 * 2024 does not change what has to be paid this week.
 */
export function PendingPayments({
  payments,
  onSelect,
  className,
}: {
  payments: PendingPayment[];
  /**
   * Confirm the payment: opens a new transaction's sheet with the concept,
   * the expected amount and the due date already set. It is passed the WHOLE
   * payment and not its concept: the other two facts are here, and asking for them again
   * would be typing while looking at this very row.
   */
  onSelect?: (payment: PendingPayment) => void;
  className?: string;
}) {
  const now = today();

  /*
    ── One cost center at a time can be hidden ───────────────────────────────
    A subscription charges itself and costs the same every month: there is
    nothing to decide with it, and ten of those push out of sight what
    does need looking at —the power bill that came with a surcharge, the insurance that
    is due on Tuesday—.

    They are turned off by CENTER and with checkboxes, not with a two-state switch:
    the centers are the ones there are, not always two, and one checkbox for each
    says which ones exist besides letting you pick. It is the same filter as the bar
    above, in small.

    It is not remembered between visits, on purpose: it is a way of looking at this list
    now, not a preference, and a saved filter that hides money is the kind
    that gets forgotten switched on.
  */
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());

  const { costCenters, visible, total } = pendingView(payments, hidden);

  /*
    No pending payments, no card.

    Empty it does not say "all up to date": it says "there is a section here", and it takes a third
    of the row to say so. In a closed period nothing can be left
    —it already happened— and in the current month, with everything paid, the good news is that
    the card is not there.

    It is also decided here and not only in the dashboard: the grid over there needs
    to know it to share out the columns, but a component that draws itself empty
    when called without data is a trap waiting for the second screen
    that uses it.
  */
  if (payments.length === 0) return null;

  return (
    <Card className={cn('h-full', className)}>
      <CardContent className="flex h-full flex-col p-4 sm:p-6">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-lg font-semibold">{t('transactions.pending.title')}</h2>

          {/*
            Only with more than one center: a single checkbox separates nothing, and a
            control that changes nothing gets pressed once and then nobody believes in
            it.

            The same dropdown as the filter in the bar above —`Menu`
            with checkboxes inside— because it does the same: cut what is being
            viewed. It lights up when something is off, which is the signal the
            app's other filters already use.
          */}
          {costCenters.length > 1 && (
            <CenterFilter costCenters={costCenters} hidden={hidden} setHidden={setHidden} />
          )}
        </div>

        {/* Always the same label; the only thing that changes is the figure, which is the
            one of what is shown. Adding a «solo fijos» to it when filtering moved the text
            under the title every time the button was pressed. */}
        <p className="truncate text-xs text-muted-foreground">
          {total > 0
            ? t('transactions.pending.aboutThisMonth', { amount: formatCOP(total) })
            : t('transactions.pending.thisMonth')}
        </p>

        {/* It scrolls instead of growing: the card shares a row with the
             chart and the donut, and a long list would stretch all three.

             The `-mr-3 pr-3` pair is for the scroll bar. On macOS
             the bar FLOATS over the content instead of taking room, so
             it is not enough for the list to fit: it needs its own air.
             The list spills 12px over the card's padding —that is where the
             bar goes, over the padding and outside the rows— and its content
             ends right at the card's inner edge. */}
        <ul className="-mr-3 mt-4 flex min-h-0 flex-1 flex-col divide-y divide-border overflow-y-auto pr-3">
          {visible.map((payment) => (
            <PendingRow key={payment.categoryId} payment={payment} now={now} onSelect={onSelect} />
          ))}
          {/* With ALL turned off, the list is empty and the card would be left with
              nothing to show but the button to go back. It is said, because a
              blank gap reads as «nothing pending», which is the
              opposite of what is happening. */}
          {visible.length === 0 && (
            <li className="py-6 text-center text-sm text-muted-foreground">
              {t('transactions.pending.offCentersNote')}
            </li>
          )}
        </ul>
      </CardContent>
    </Card>
  );
}

/** What a payment made in several installments has covered so far. */
function PendingProgress({
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

function PendingSummary({ payment, isOverdue }: { payment: PendingPayment; isOverdue: boolean }) {
  return (
    <span className="flex w-full items-center justify-between gap-3">
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{payment.name}</span>
        <span className="block truncate text-xs text-muted-foreground">{payment.path}</span>
      </span>

      <span className="shrink-0 text-right">
        {payment.expectedAmount && (
          <span className="tabular block text-sm font-semibold">
            {formatCOP(payment.expectedAmount)}
          </span>
        )}
        {/* Overdue in amber, not in red: it is owed, nothing went wrong.
              Red is reserved for errors. */}
        <span
          className={cn(
            'block text-xs',
            isOverdue ? 'font-medium text-warning' : 'text-muted-foreground',
          )}
        >
          {shortDay(payment.dueDate)}
        </span>
      </span>
    </span>
  );
}

function PendingRow({
  payment,
  now,
  onSelect,
}: {
  payment: PendingPayment;
  now: string;
  onSelect: ((payment: PendingPayment) => void) | undefined;
}) {
  const isOverdue = payment.dueDate < now;

  /*
      How much it has covered so far, for those paid in several installments.

      It is `null` when there is no total to reach: with no expected value there
      is no fraction to paint, and a bar without a denominator is a
      bar that lies. Those are painted like any other pending payment.
    */
  const total = Number(payment.expectedAmount ?? 0);
  const paidSoFar = Number(payment.paidAmount);
  const progress = payment.isMultiPayment && total > 0 ? paidSoFar / total : null;

  return (
    <li
      /*
          The two dividers that the pointed row TOUCHES are turned off.

          The highlight is a rounded rectangle, and a line that
          enters it through the edge splits it: it reads as if the row
          were cut instead of lifted. Turning off the line
          above and the one below, the row stands loose among the others
          —which is what it is saying— and the list does not lose its
          grid, because the rest are still there.

          In Tailwind 4 the divider is the BOTTOM border of the previous
          element, so there are two to turn off and not one: its own,
          which is the bottom one, and that of the one right before, which is the
          top one. Hence the `:has()`.

          And they fade instead of disappearing: the row already changes
          color with a transition, and a line that jumps while
          the background blends looks like a painting glitch.
        */
      className={cn(
        'transition-colors',
        'hover:border-b-transparent',
        '[&:has(+li:hover)]:border-b-transparent',
      )}
    >
      <CardRow onClick={onSelect ? () => onSelect(payment) : undefined}>
        <PendingSummary payment={payment} isOverdue={isOverdue} />

        {/*
            ── What it has covered so far ─────────────────────────
            The figure on the right is the month's TOTAL, same as in
            any other pending payment. What this line adds is
            how far along it is: without it, a concept paid in several
            installments reads as one that has not been paid at all, which is
            exactly the opposite of what is happening.

            And it says «Registrar otro» and not «Confirmar pago» because that
            is what is going to happen on pressing: the sheet opens with the
            amount EMPTY and today's date, to note down this installment and not
            to mark the month as settled.
          */}
        <PendingProgress payment={payment} progress={progress} hasAction={onSelect !== undefined} />
      </CardRow>
    </li>
  );
}

function CenterFilter({
  costCenters,
  hidden,
  setHidden,
}: {
  costCenters: [id: string, nombre: string][];
  hidden: ReadonlySet<string>;
  setHidden: Dispatch<SetStateAction<ReadonlySet<string>>>;
}) {
  return (
    <Menu
      label={t('transactions.pending.filterByCostCenter')}
      Icon={Filter}
      isIconOnly
      isActive={hidden.size > 0}
      kind="panel"
      width="sm"
      align="right"
    >
      <div className="flex flex-col">
        <MenuTitle>{t('shell.sections.costCenters')}</MenuTitle>
        {costCenters.map(([id, name]) => {
          const isChecked = !hidden.has(id);
          return (
            <label
              key={id}
              className={cn(
                'flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm',
                HIGHLIGHT,
                isChecked && 'font-medium',
              )}
            >
              <Checkbox
                checked={isChecked}
                onChange={() => setHidden((before) => toggleCenter(before, id, isChecked))}
              />
              <span className="min-w-0 flex-1 truncate">{name}</span>
            </label>
          );
        })}
      </div>
    </Menu>
  );
}

/** The hidden centers after pressing one's checkbox. */
function toggleCenter(
  before: ReadonlySet<string>,
  id: string,
  isChecked: boolean,
): ReadonlySet<string> {
  const next = new Set(before);
  // Unchecking the last one would leave the card empty without
  // saying why. It is allowed —and the list explains it—
  // because refusing it would force guessing which of the
  // checkboxes is stuck and why.
  if (isChecked) next.add(id);
  else next.delete(id);
  return next;
}

/** What is shown: the centers that can be turned off, the payments that are on and their sum. */
function pendingView(payments: PendingPayment[], hidden: ReadonlySet<string>) {
  /*
    ── If the data does not come, the filter does not exist ─────────────────
    The server sends the center, and a server older than this screen
    does not send it. Filtering without it would leave the list empty and the button would look
    broken, which is exactly what happened: it is the normal asymmetry of a deploy,
    where the screen and the API do not arrive at the same time.
  */
  const isMissingData = payments.some(
    (p) => (p as Partial<PendingPayment>).costCenterId === undefined,
  );

  // The centers that really have something pending, in the order in which
  // they appear: a checkbox for a center with nothing to show filters nothing.
  const costCenters = isMissingData
    ? []
    : [...new Map(payments.map((p) => [String(p.costCenterId), p.costCenter])).entries()];

  const visible = payments.filter((p) => isMissingData || !hidden.has(String(p.costCenterId)));

  // The total is that of what IS SHOWN. With the sum of everything under a
  // cut list, the figure contradicts what is below and there is no way to know
  // which of the two is lying.
  const total = visible.reduce((s, p) => s + Number(p.expectedAmount ?? 0), 0);

  return { costCenters, visible, total };
}
