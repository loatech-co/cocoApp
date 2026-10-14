import { Flag } from 'lucide-react';

import { useUpdateTransaction } from '@/features/transactions/api/transactions';
import { selectedPath, transactionName } from '@/features/transactions/model/transactions';
import { type CategoryTree } from '@/shared/api/categories';
import { type Transaction } from '@/shared/api/generated/model';
import { formatMoney, shortDay, shortMonth } from '@/shared/lib/format';
import { t } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { type ColumnSort } from '@/shared/ui/atoms/sort-button';
import { WithTooltip } from '@/shared/ui/atoms/tooltip';
import { Select } from '@/shared/ui/organisms/select';

/** How the table asks for a column's sort: by which field, and in which direction it starts. */
export type ColumnOrder = (field: string, first: 'asc' | 'desc') => ColumnSort;

/**
 * What a row of the transactions table knows and does, whatever shape it is
 * drawn in: a table row on the desktop, an expandable card on the phone.
 * Written once so the two cannot drift apart —one learning to lock a static
 * center and the other not—.
 */
export function useRowClassification(transaction: Transaction, tree: CategoryTree[]) {
  const update = useUpdateTransaction();
  const { costCenter, category } = selectedPath(tree, transaction.categoryId ?? undefined);

  // Changing the selector saves EXACTLY what was picked, without guessing the rest.
  // The temptation is "keep the concept if it exists with the same name in the
  // new category", but that moves money to a place nobody asked for and nobody sees.
  const reclassify = (id: number | undefined): void => {
    update.mutate({ id: transaction.id, changes: { categoryId: id ?? null } });
  };

  /*
    A STATIC center is not reclassified from here.

    The structure of fixed costs is not improvised —rent does not change
    category on a Tuesday—, and in a hundred-row table with a dropdown in
    each one, a careless click moves money around without anyone noticing.

    Not from the transaction modal either: static is static. If something really
    has to be moved, the center is made dynamic from Centros de costos —a
    deliberate act, on another screen— and then it is moved.
  */
  const isStatic = costCenter?.isStatic ?? false;
  const reason = isStatic
    ? t('transactions.table.staticCenter', { name: costCenter?.name })
    : undefined;

  return {
    costCenter,
    category,
    reclassify,
    isStatic,
    reason,
    isPending: update.isPending,
    // Unclassified is not an error, it is something pending: the row is marked so that
    // you can tell from afar which ones are left to sort after an import.
    isUnclassified: transaction.categoryId === null,
  };
}

export type RowClassification = ReturnType<typeof useRowClassification>;

/** The two selectors of a row: its cost center and its category. */
export function CostCenterSelector({
  row,
  tree,
}: {
  row: RowClassification;
  tree: CategoryTree[];
}) {
  return (
    <RowSelector
      aria={t('centers.levels.costCenter')}
      value={row.costCenter?.id}
      options={tree}
      disabled={row.isStatic}
      reason={row.reason}
      onSelect={row.reclassify}
    />
  );
}

export function CategorySelector({ row }: { row: RowClassification }) {
  return (
    <RowSelector
      aria={t('centers.levels.category')}
      value={row.category?.id}
      options={row.costCenter?.children ?? []}
      disabled={row.isStatic || !row.costCenter}
      reason={row.reason}
      onSelect={(id) => row.reclassify(id ?? row.costCenter?.id)}
    />
  );
}

function RowSelector({
  aria,
  value,
  options,
  disabled: isDisabled,
  reason,
  onSelect,
}: {
  aria: string;
  value?: number | undefined;
  options: CategoryTree[];
  disabled?: boolean;
  /** Why it is locked. A disabled control with no explanation reads as
      an app error. */
  reason?: string | undefined;
  onSelect: (id: number | undefined) => void;
}) {
  const selector = (
    <Select
      size="sm"
      label={aria}
      emptyLabel={`${aria}…`}
      value={value === undefined ? '' : String(value)}
      disabled={isDisabled}
      options={options.map((o) => ({ value: String(o.id), label: o.name }))}
      onChange={(v) => onSelect(v === '' ? undefined : Number(v))}
    />
  );

  if (!isDisabled || reason === undefined) return selector;

  return (
    <WithTooltip text={reason} className="w-full">
      {selector}
    </WithTooltip>
  );
}

const monthOf = (iso: string): string => iso.slice(0, 7);

/**
 * The transaction's period.
 *
 * With a fallback to the payment date on purpose: during a deploy the old API
 * —which does not send `period`— and the new frontend live together for a few seconds, and a
 * missing field cannot leave the screen blank.
 */
// `period` optional in the input type: it is what the note above says.
const period = (
  m: Pick<Transaction, 'date'> & { period?: Transaction['period'] | undefined },
): string => monthOf(m.period ?? m.date);

/** The expense belongs to one month and was paid in another. */
const isStale = (m: Transaction): boolean => period(m) !== monthOf(m.date);

/**
 * The month the transaction belongs to.
 *
 * In amber when the month the expense BELONGS to is not the one in which
 * the money went out: the July bill paid on August 4. It is the case
 * that throws off the totals of whoever does not notice —July looks cheap and
 * August expensive— so it is marked, with a dot and with an explanation.
 */
export function PeriodLabel({ transaction }: { transaction: Transaction }) {
  if (!isStale(transaction)) return <>{shortMonth(period(transaction))}</>;

  return (
    <WithTooltip
      text={t('transactions.table.latePayment', {
        month: shortMonth(period(transaction)),
        day: shortDay(transaction.date),
      })}
      className="items-center gap-1.5 font-medium text-warning"
    >
      {/* The dot makes the mark noticeable: color alone gets lost in a
          column of gray text, and whoever does not notice it does not know there is something
          to ask. */}
      <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-warning" />
      {shortMonth(period(transaction))}
    </WithTooltip>
  );
}

/** The amount, signed and in the color of its direction. */
export function AmountText({ transaction }: { transaction: Transaction }) {
  return (
    <span
      className={cn(
        'tabular whitespace-nowrap font-semibold',
        transaction.type === 'income' ? 'text-income' : 'text-expense',
      )}
    >
      {transaction.type === 'income' ? '+' : '−'}
      {formatMoney(transaction.amount, transaction.currency)}
    </span>
  );
}

/** The name, with the flag of what is left to classify. */
export function TransactionLabel({
  transaction,
  tree,
  isUnclassified,
}: {
  transaction: Transaction;
  tree: CategoryTree[];
  isUnclassified: boolean;
}) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      {isUnclassified && (
        <Flag
          className="size-3.5 shrink-0 text-warning"
          fill="currentColor"
          aria-label={t('transactions.table.unclassified')}
        />
      )}
      {/* The name COMES from the concept: a transaction is a record and it
          takes it from where it belongs. It painted `description`, which stopped
          being filled when the sheet swapped its free «Concepto» field
          for a concept selector —so everything recorded by hand
          said «Sin concepto» even though it had its concept picked—. */}
      <span className="block min-w-0 max-w-56 truncate font-medium">
        {transactionName(transaction, tree)}
      </span>
    </span>
  );
}
