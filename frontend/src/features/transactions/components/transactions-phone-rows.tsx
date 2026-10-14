import { useState } from 'react';

import { type CategoryTree } from '@/shared/api/categories';
import { type Transaction } from '@/shared/api/generated/model';
import { shortDay } from '@/shared/lib/format';
import { t } from '@/shared/lib/i18n';
import { Button } from '@/shared/ui/atoms/button';
import {
  ExpandableRow,
  ExpandableRows,
  ExpandableRowsFoot,
  ExpandableRowsHead,
  ExpandableRowsSkeleton,
  RowFacts,
} from '@/shared/ui/molecules/expandable-rows';

import {
  AmountText,
  CategorySelector,
  type ColumnOrder,
  CostCenterSelector,
  PeriodLabel,
  TransactionLabel,
  useRowClassification,
  type RowClassification,
} from './transaction-row-parts';

/** The totals under the rows: what the table's footer says on the desktop. */
export interface PhoneTotal {
  label: string;
  amount: string;
}

/**
 * The transactions table, on the phone.
 *
 * Each row shows its name and its amount; a tap unfolds the rest —period,
 * payment date, cost center and category (still editable in place), notes—
 * and the button that opens the transaction, which is what tapping a row
 * does on the desktop. One row open at a time: two open rows push the list
 * apart and the eye loses which one it was reading.
 *
 * The rows sort by their two visible columns, from the header, as on the
 * desktop. The other sortable column —the payment date— sorts on the
 * desktop only: on the phone it is not visible to compare.
 */
export function PhoneTransactionRows({
  transactions,
  tree,
  isLoading,
  skeletonRows,
  onOpen,
  sort,
  total,
}: {
  transactions: Transaction[];
  tree: CategoryTree[];
  isLoading: boolean;
  skeletonRows: number;
  onOpen: (transaction: Transaction) => void;
  sort: ColumnOrder | undefined;
  total: PhoneTotal | undefined;
}) {
  const [openId, setOpenId] = useState<number | null>(null);

  return (
    <ExpandableRows
      head={<PhoneHead sort={sort} />}
      foot={
        total && !isLoading ? (
          <ExpandableRowsFoot
            label={total.label}
            value={<span className="font-semibold text-expense">{total.amount}</span>}
          />
        ) : undefined
      }
    >
      {isLoading ? (
        <ExpandableRowsSkeleton rows={skeletonRows} />
      ) : (
        transactions.map((m) => (
          <PhoneRow
            key={m.id}
            transaction={m}
            tree={tree}
            isOpen={openId === m.id}
            onToggle={() => setOpenId(openId === m.id ? null : m.id)}
            onOpen={() => onOpen(m)}
          />
        ))
      )}
    </ExpandableRows>
  );
}

/** The names of the two visible columns, sorting as on the desktop. */
function PhoneHead({ sort }: { sort: ColumnOrder | undefined }) {
  return (
    <ExpandableRowsHead
      primary={{ label: t('transactions.table.columns.concept'), sort: sort?.('merchant', 'asc') }}
      value={{ label: t('transactions.table.columns.amount'), sort: sort?.('amount', 'desc') }}
    />
  );
}

function PhoneRow({
  transaction,
  tree,
  isOpen,
  onToggle,
  onOpen,
}: {
  transaction: Transaction;
  tree: CategoryTree[];
  isOpen: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const row = useRowClassification(transaction, tree);

  return (
    <ExpandableRow
      primary={
        <TransactionLabel
          transaction={transaction}
          tree={tree}
          isUnclassified={row.isUnclassified}
        />
      }
      value={<AmountText transaction={transaction} />}
      isOpen={isOpen}
      onToggle={onToggle}
      isFlagged={row.isUnclassified}
      isDimmed={row.isPending}
    >
      <RowFacts facts={rowFacts(transaction, row, tree)} />

      <Button type="button" variant="outline" className="w-full" onClick={onOpen}>
        {t('transactions.table.open')}
      </Button>
    </ExpandableRow>
  );
}

/** What the desktop shows in columns, as label and value. */
function rowFacts(transaction: Transaction, row: RowClassification, tree: CategoryTree[]) {
  return [
    {
      label: t('transactions.table.columns.period'),
      value: <PeriodLabel transaction={transaction} />,
    },
    {
      label: t('transactions.table.columns.paidOn'),
      value: <span className="tabular">{shortDay(transaction.date)}</span>,
    },
    {
      label: t('transactions.table.columns.costCenter'),
      value: <CostCenterSelector row={row} tree={tree} />,
    },
    { label: t('transactions.table.columns.category'), value: <CategorySelector row={row} /> },
    ...(transaction.notes
      ? [{ label: t('transactions.fields.notes'), value: transaction.notes }]
      : []),
  ];
}
