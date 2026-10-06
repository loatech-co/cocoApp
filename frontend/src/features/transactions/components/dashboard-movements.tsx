import type { ReactNode } from 'react';

import { TransactionsTable } from '@/features/transactions/components/transactions-table';
import { PAGE_SIZE, type useDashboardPage } from '@/features/transactions/hooks/use-dashboard-page';
import { type Category, type Transaction } from '@/shared/api/generated/model';
import { formatCOP } from '@/shared/lib/format';
import { t } from '@/shared/lib/i18n';
import { ErrorAlert } from '@/shared/ui/atoms/alert';
import { Pager } from '@/shared/ui/atoms/pager';
import { TableFooter, Td } from '@/shared/ui/molecules/table';

type Table = ReturnType<typeof useDashboardPage>['table'];

/** La tabla del resumen: todo lo que cae en el recorte, paginado. */
export function DashboardMovements({
  table,
  tree,
  onOpen,
}: {
  table: Table;
  tree: Category[];
  onOpen: (transaction: Transaction) => void;
}) {
  const { page, setPage, transactions, orderBy } = table;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <PageCount page={page} total={transactions.data?.meta.total} />

      {/* Not an empty table: «no movements» on a failed load reads as if
          they were gone. */}
      {transactions.isError ? (
        <ErrorAlert message={t('transactions.dashboard.movementsLoadFailed')} />
      ) : (
        <TransactionsTable
          transactions={transactions.data?.data ?? []}
          tree={tree}
          isLoading={transactions.isPending}
          onOpen={onOpen}
          sort={orderBy}
          skeletonRows={8}
          pie={tableFooter(transactions.data)}
        />
      )}

      <Pager
        page={page}
        total={transactions.data?.meta.total ?? 0}
        perPage={PAGE_SIZE}
        onPageChange={setPage}
      />
    </div>
  );
}

function PageCount({ page, total }: { page: number; total: number | undefined }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h2 className="font-display text-lg font-semibold">
        {t('transactions.dashboard.movements')}
      </h2>
      {total !== undefined && total > 0 && (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {t('transactions.dashboard.range', {
            from: (page - 1) * PAGE_SIZE + 1,
            to: Math.min(page * PAGE_SIZE, total),
            total,
          })}
        </p>
      )}
    </div>
  );
}

function tableFooter(data: Table['transactions']['data']): ReactNode {
  if (!data || data.data.length === 0) return undefined;
  return (
    <TableFooter>
      <tr>
        <Td isSticky hasDivider={false}>
          {t('transactions.dashboard.total', { total: data.meta.total })}
        </Td>
        <Td />
        <Td />
        <Td />
        <Td />
        <Td align="right" className="tabular font-semibold text-expense">
          {formatCOP(data.meta.sumExpense)}
        </Td>
      </tr>
    </TableFooter>
  );
}
