import { useState } from 'react';

import { useReceipts } from '@/features/transactions/api/receipts';
import { useReceiptFiles } from '@/features/transactions/hooks/use-receipt-files';
import { selectedPath } from '@/features/transactions/model/transactions';
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

import { Lightbox } from './receipt-viewer';
import {
  AmountText,
  type ColumnOrder,
  PeriodLabel,
  TransactionLabel,
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
 * payment date, where it is classified, notes— READ-ONLY, and two actions:
 * «Editar», which opens the sheet already editable, and «Ver soporte», which
 * opens the receipt viewer. Changing anything happens in the sheet; the
 * desktop keeps its in-row selectors. One row open at a time: two open rows
 * push the list apart and the eye loses which one it was reading.
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
  onEdit,
  sort,
  total,
}: {
  transactions: Transaction[];
  tree: CategoryTree[];
  isLoading: boolean;
  skeletonRows: number;
  onEdit: (transaction: Transaction) => void;
  sort: ColumnOrder | undefined;
  total: PhoneTotal | undefined;
}) {
  const [openId, setOpenId] = useState<number | null>(null);

  return (
    <ExpandableRows
      label={t('transactions.dashboard.movements')}
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
            onEdit={() => onEdit(m)}
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
  onEdit,
}: {
  transaction: Transaction;
  tree: CategoryTree[];
  isOpen: boolean;
  onToggle: () => void;
  onEdit: () => void;
}) {
  const isUnclassified = transaction.categoryId === null;

  return (
    <ExpandableRow
      primary={
        <TransactionLabel transaction={transaction} tree={tree} isUnclassified={isUnclassified} />
      }
      value={<AmountText transaction={transaction} />}
      isOpen={isOpen}
      onToggle={onToggle}
      isFlagged={isUnclassified}
    >
      <RowDetails transaction={transaction} tree={tree} onEdit={onEdit} />
    </ExpandableRow>
  );
}

/**
 * The open drawer. It only mounts while the row is open, and that is when it
 * asks for the transaction's receipts: the list does not say whether a row has
 * any, so «Ver soporte» appears once the answer is in.
 */
function RowDetails({
  transaction,
  tree,
  onEdit,
}: {
  transaction: Transaction;
  tree: CategoryTree[];
  onEdit: () => void;
}) {
  const receipts = useReceipts(transaction.id);
  const count = receipts.data?.length ?? 0;
  const [isViewing, setIsViewing] = useState(false);

  return (
    <>
      <RowFacts facts={rowFacts(transaction, tree, receipts.isSuccess && count === 0)} />

      <div className="flex flex-col gap-2">
        <Button type="button" variant="outline" className="w-full" onClick={onEdit}>
          {t('common.edit')}
        </Button>
        {count > 0 && (
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => setIsViewing(true)}
          >
            {t('transactions.table.viewReceipt')}
          </Button>
        )}
      </div>

      {isViewing && (
        <ReceiptsViewer transactionId={transaction.id} onClose={() => setIsViewing(false)} />
      )}
    </>
  );
}

/**
 * The full-screen viewer the sheet uses, on the first receipt with its pager.
 * The files are only downloaded from here, when someone asked to look.
 */
function ReceiptsViewer({
  transactionId,
  onClose,
}: {
  transactionId: number;
  onClose: () => void;
}) {
  const files = useReceiptFiles(transactionId);
  const [index, setIndex] = useState(0);

  if (files.list.length === 0) return null;

  return (
    <Lightbox
      transactionId={transactionId}
      list={files.list}
      urls={files.urls}
      errors={files.failures}
      onRetry={files.retry}
      index={Math.min(index, files.list.length - 1)}
      onGoTo={setIndex}
      onClose={onClose}
    />
  );
}

/** What the desktop shows in columns, as label and value, to read. */
function rowFacts(transaction: Transaction, tree: CategoryTree[], hasNoReceipt: boolean) {
  const { costCenter, category } = selectedPath(tree, transaction.categoryId ?? undefined);
  const classification = [costCenter?.name, category?.name].filter(Boolean).join(' › ');

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
      label: t('transactions.table.classification'),
      value: classification || (
        <span className="text-muted-foreground">{t('transactions.table.unclassified')}</span>
      ),
    },
    ...(transaction.notes
      ? [{ label: t('transactions.fields.notes'), value: transaction.notes }]
      : []),
    ...(hasNoReceipt
      ? [
          {
            label: t('transactions.table.receipt'),
            value: (
              <span className="text-muted-foreground">{t('transactions.table.noReceipt')}</span>
            ),
          },
        ]
      : []),
  ];
}
