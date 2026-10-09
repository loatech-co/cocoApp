import { Flag, SearchX } from 'lucide-react';
import type { ReactNode } from 'react';

import { useUpdateTransaction } from '@/features/transactions/api/transactions';
import { transactionName, selectedPath } from '@/features/transactions/model/transactions';
import { type CategoryTree } from '@/shared/api/categories';
import { type Transaction } from '@/shared/api/generated/model';
import { formatMoney, shortDay, shortMonth } from '@/shared/lib/format';
import { t } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { Card, CardContent } from '@/shared/ui/atoms/card';
import { EmptyState } from '@/shared/ui/atoms/empty-state';
import { WithTooltip } from '@/shared/ui/atoms/tooltip';
import { Table, TableSkeleton, Td, Th, Tr } from '@/shared/ui/molecules/table';
import { Select } from '@/shared/ui/organisms/select';

/** The columns, in a single place: the skeleton has to have the same ones. */
const COLUMNS = [
  t('transactions.table.columns.concept'),
  t('transactions.table.columns.period'),
  t('transactions.table.columns.paidOn'),
  t('transactions.table.columns.costCenter'),
  t('transactions.table.columns.category'),
  t('transactions.table.columns.amount'),
];

interface ColumnSort {
  direction: 'asc' | 'desc' | null;
  onChange: () => void;
}

/** How the table asks for a column's sort: by which field, and in which direction it starts. */
type ColumnOrder = (field: string, first: 'asc' | 'desc') => ColumnSort;

/**
 * The transactions table.
 *
 * ── Why it is a component and not two tables ────────────────────────────────
 * Because the dashboard and the Movimientos screen show THE SAME: the same
 * columns, the same in-row editing, the same modal. Written separately
 * they start out the same and drift apart —one learns to mark what is left to
 * classify and the other does not— until the same money looks different depending on
 * where you come in.
 *
 * What changes between the two is the OUTLINE: whether there are headers that sort, whether
 * there is a totals footer and how many rows fit. That is what gets passed.
 */
export function TransactionsTable({
  transactions,
  tree,
  isLoading = false,
  onOpen,
  sort,
  pie,
  emptyLabel,
  skeletonRows = 8,
}: {
  transactions: Transaction[];
  tree: CategoryTree[];
  isLoading?: boolean;
  onOpen: (transaction: Transaction) => void;
  /** Without this the headers do not sort: in a dashboard it would make no sense. */
  sort?: ColumnOrder;
  pie?: ReactNode;
  emptyLabel?: ReactNode;
  skeletonRows?: number;
}) {
  if (isLoading) {
    return <TableSkeleton columns={COLUMNS} rows={skeletonRows} hasDivider={false} />;
  }

  if (transactions.length === 0) {
    return (
      <Card>
        <CardContent className="p-0">
          {emptyLabel ?? (
            <EmptyState
              Icon={SearchX}
              title={t('transactions.table.noMatchTitle')}
              description={t('transactions.table.noMatchHelp')}
            />
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Table>
      <TransactionsHead sort={sort} />

      <tbody>
        {transactions.map((m) => (
          <Row key={m.id} transaction={m} tree={tree} onOpen={() => onOpen(m)} />
        ))}
      </tbody>

      {pie}
    </Table>
  );
}

interface RowProps {
  transaction: Transaction;
  tree: CategoryTree[];
  onOpen: () => void;
}

function Row({ transaction, tree, onOpen }: RowProps) {
  const update = useUpdateTransaction();
  const { costCenter, category } = selectedPath(tree, transaction.categoryId ?? undefined);

  // Changing the selector saves EXACTLY what was picked, without guessing the rest.
  // The temptation is "keep the concept if it exists with the same name in the
  // new category", but that moves money to a place nobody asked for and nobody sees.
  const reclassify = (id: number | undefined): void => {
    update.mutate({ id: transaction.id, changes: { categoryId: id ?? null } });
  };

  // Unclassified is not an error, it is something pending: the row is marked so that
  // you can tell from afar which ones are left to sort after an import.
  const isUnclassified = transaction.categoryId === null;

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

  return (
    <Tr onClick={onOpen} isFlagged={isUnclassified} isDimmed={update.isPending}>
      <NameCell transaction={transaction} tree={tree} isUnclassified={isUnclassified} />

      <PeriodCell transaction={transaction} />

      <Td className="tabular whitespace-nowrap text-muted-foreground">
        {shortDay(transaction.date)}
      </Td>

      {/* The selectors stop the click: opening a list must not also open
          the modal behind it. */}
      <Td className="w-48">
        <span onClick={(e) => e.stopPropagation()}>
          <RowSelector
            aria={t('centers.levels.costCenter')}
            value={costCenter?.id}
            options={tree}
            disabled={isStatic}
            reason={reason}
            onSelect={reclassify}
          />
        </span>
      </Td>

      <Td className="w-48">
        <span onClick={(e) => e.stopPropagation()}>
          <RowSelector
            aria={t('centers.levels.category')}
            value={category?.id}
            options={costCenter?.children ?? []}
            disabled={isStatic || !costCenter}
            reason={reason}
            onSelect={(id) => reclassify(id ?? costCenter?.id)}
          />
        </span>
      </Td>

      <AmountCell transaction={transaction} />
    </Tr>
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

function AmountCell({ transaction }: { transaction: Transaction }) {
  return (
    <Td
      align="right"
      className={cn(
        'tabular whitespace-nowrap font-semibold',
        transaction.type === 'income' ? 'text-income' : 'text-expense',
      )}
    >
      {transaction.type === 'income' ? '+' : '−'}
      {formatMoney(transaction.amount, transaction.currency)}
    </Td>
  );
}

function PeriodCell({ transaction }: { transaction: Transaction }) {
  return (
    <Td className="whitespace-nowrap text-muted-foreground">
      {/*
        In amber when the month the expense BELONGS to is not the one in which
        the money went out: the July bill paid on August 4. It is the case
        that throws off the totals of whoever does not notice —July looks cheap and
        August expensive— so it is marked, with a dot and with an explanation.
      */}
      {isStale(transaction) ? (
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
      ) : (
        shortMonth(period(transaction))
      )}
    </Td>
  );
}

function NameCell({
  transaction,
  tree,
  isUnclassified,
}: {
  transaction: Transaction;
  tree: CategoryTree[];
  isUnclassified: boolean;
}) {
  return (
    <Td isSticky hasDivider={false} isFlagged={isUnclassified}>
      <span className="flex items-center gap-2">
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
        <span className="block max-w-56 truncate font-medium">
          {transactionName(transaction, tree)}
        </span>
      </span>
    </Td>
  );
}

function TransactionsHead({ sort }: { sort: ColumnOrder | undefined }) {
  return (
    <thead>
      <tr>
        <Th isSticky hasDivider={false} sort={sort?.('merchant', 'asc')}>
          {t('transactions.table.columns.concept')}
        </Th>
        {/* The period before the payment: it is the axis the app is viewed by
            —the month the expense BELONGS to— and the payment date is the supporting
            fact that explains why they sometimes do not match. */}
        <Th>{t('transactions.table.columns.period')}</Th>
        <Th sort={sort?.('date', 'desc')}>{t('transactions.table.columns.paidOn')}</Th>
        <Th>{t('transactions.table.columns.costCenter')}</Th>
        <Th>{t('transactions.table.columns.category')}</Th>
        <Th align="right" sort={sort?.('amount', 'desc')}>
          {t('transactions.table.columns.amount')}
        </Th>
      </tr>
    </thead>
  );
}
