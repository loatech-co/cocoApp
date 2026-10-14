import { SearchX } from 'lucide-react';
import type { ReactNode } from 'react';

import { type CategoryTree } from '@/shared/api/categories';
import { type Transaction } from '@/shared/api/generated/model';
import { shortDay } from '@/shared/lib/format';
import { t } from '@/shared/lib/i18n';
import { useIsMobile } from '@/shared/lib/mobile';
import { Card, CardContent } from '@/shared/ui/atoms/card';
import { EmptyState } from '@/shared/ui/atoms/empty-state';
import { Table, TableSkeleton, Td, Th, Tr } from '@/shared/ui/molecules/table';

import {
  AmountText,
  CategorySelector,
  type ColumnOrder,
  CostCenterSelector,
  PeriodLabel,
  TransactionLabel,
  useRowClassification,
} from './transaction-row-parts';
import { PhoneTransactionRows, type PhoneTotal } from './transactions-phone-rows';

/** The columns, in a single place: the skeleton has to have the same ones. */
const COLUMNS = [
  t('transactions.table.columns.concept'),
  t('transactions.table.columns.period'),
  t('transactions.table.columns.paidOn'),
  t('transactions.table.columns.costCenter'),
  t('transactions.table.columns.category'),
  t('transactions.table.columns.amount'),
];

interface TransactionsTableProps {
  transactions: Transaction[];
  tree: CategoryTree[];
  isLoading?: boolean;
  onOpen: (transaction: Transaction) => void;
  /** Without this the headers do not sort: in a dashboard it would make no sense. */
  sort?: ColumnOrder;
  pie?: ReactNode;
  /** The totals on the phone, where the table's footer cells do not exist. */
  phoneTotal?: PhoneTotal | undefined;
  emptyLabel?: ReactNode;
  skeletonRows?: number;
}

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
 *
 * On the phone the same rows are expandable cards (`PhoneTransactionRows`):
 * the name and the amount, and the rest behind a tap.
 */
export function TransactionsTable({
  transactions,
  tree,
  isLoading = false,
  onOpen,
  sort,
  pie,
  phoneTotal,
  emptyLabel,
  skeletonRows = 8,
}: TransactionsTableProps) {
  const isMobile = useIsMobile();

  if (isLoading && !isMobile) {
    return <TableSkeleton columns={COLUMNS} rows={skeletonRows} hasDivider={false} />;
  }

  if (transactions.length === 0 && !isLoading) return <NoTransactions label={emptyLabel} />;

  if (isMobile) {
    return (
      <PhoneTransactionRows
        transactions={transactions}
        tree={tree}
        isLoading={isLoading}
        skeletonRows={skeletonRows}
        onOpen={onOpen}
        sort={sort}
        total={phoneTotal}
      />
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

/** The card that stands in for an empty table. */
function NoTransactions({ label }: { label: ReactNode }) {
  return (
    <Card>
      <CardContent className="p-0">
        {label ?? (
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

interface RowProps {
  transaction: Transaction;
  tree: CategoryTree[];
  onOpen: () => void;
}

function Row({ transaction, tree, onOpen }: RowProps) {
  const row = useRowClassification(transaction, tree);

  return (
    <Tr onClick={onOpen} isFlagged={row.isUnclassified} isDimmed={row.isPending}>
      <Td isSticky hasDivider={false} isFlagged={row.isUnclassified}>
        <TransactionLabel
          transaction={transaction}
          tree={tree}
          isUnclassified={row.isUnclassified}
        />
      </Td>

      <Td className="whitespace-nowrap text-muted-foreground">
        <PeriodLabel transaction={transaction} />
      </Td>

      <Td className="tabular whitespace-nowrap text-muted-foreground">
        {shortDay(transaction.date)}
      </Td>

      {/* The selectors stop the click: opening a list must not also open
          the modal behind it. */}
      <Td className="w-48">
        <span onClick={(e) => e.stopPropagation()}>
          <CostCenterSelector row={row} tree={tree} />
        </span>
      </Td>

      <Td className="w-48">
        <span onClick={(e) => e.stopPropagation()}>
          <CategorySelector row={row} />
        </span>
      </Td>

      <Td align="right">
        <AmountText transaction={transaction} />
      </Td>
    </Tr>
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
