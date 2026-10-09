import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useTransactions } from '@/features/transactions/api/transactions';
import { transactionName, transactionDirection } from '@/features/transactions/model/transactions';
import { useCategories } from '@/shared/api/categories';
import { type Category, type Transaction } from '@/shared/api/generated/model';
import { shortDay } from '@/shared/lib/format';
import { t } from '@/shared/lib/i18n';
import { useOnChange } from '@/shared/lib/on-change';
import { ErrorAlert } from '@/shared/ui/atoms/alert';
import { Amount } from '@/shared/ui/atoms/amount';
import { BottomSheet } from '@/shared/ui/atoms/bottom-sheet';
import { Input } from '@/shared/ui/atoms/input';
import { PanelRow } from '@/shared/ui/atoms/panel-row';
import { Skeleton } from '@/shared/ui/atoms/skeleton';

/** How many results fit before the list stops being an answer. */
const MAX_RESULTS = 20;

/**
 * Search for a transaction, from any screen.
 *
 * ── Why it is a sheet and not a screen ──────────────────────────────────────
 * Because searching is not going somewhere else: it is looking up for a moment without
 * letting go of what you were doing. A results screen forces coming back
 * with the back button, and on the way back the previous screen has already lost the place
 * where it was.
 *
 * ── Why the results go INSIDE ───────────────────────────────────────────────
 * The alternative was taking what was typed to the transactions list as a filter,
 * and that answers another question: «show me all the ones that say this», with its
 * table, its sort and its paginator. Here the question is «where is that
 * expense?», and it ends when it is found: you tap it and its sheet opens.
 *
 * ── The field DOES start focused ────────────────────────────────────────────
 * It is the exception the focus rule grants: a search box that appears
 * because someone asked to search. Asking to search and then also having to tap the box
 * are two gestures for a single intention.
 */
export function SearchPanel({
  isOpen,
  onClose,
  onSelect,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (transaction: Transaction) => void;
}) {
  const { text, setText, query } = useDebouncedSearch(isOpen);

  return (
    <BottomSheet
      isOpen={isOpen}
      title={t('shell.bottomBar.search')}
      head={<SearchHead text={text} onChange={setText} />}
      onClose={onClose}
    >
      {/*
        The list is a separate component and only mounts when there is something to
        ask. The sheet is ALWAYS mounted —open or closed, so it can
        slide—, so a query written in here would fire on
        every phone screen even if nobody has touched the magnifier.
      */}
      {query === '' ? (
        <p className="px-3 py-6 text-center text-sm text-muted-foreground">
          {t('transactions.searchPanel.help')}
        </p>
      ) : (
        <Results query={query} onSelect={onSelect} />
      )}
    </BottomSheet>
  );
}

function Results({
  query,
  onSelect,
}: {
  query: string;
  onSelect: (transaction: Transaction) => void;
}) {
  const transactions = useTransactions({ q: query, perPage: MAX_RESULTS, sort: '-date' });
  const categories = useCategories();
  const tree = categories.data ?? [];

  if (transactions.isPending) {
    return (
      <div className="flex flex-col gap-2 py-1">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-12 rounded-lg" />
        ))}
      </div>
    );
  }

  if (transactions.isError) {
    return <ErrorAlert message={t('transactions.searchPanel.failed')} />;
  }

  const rows = transactions.data.data;

  if (rows.length === 0) {
    return (
      <p className="px-3 py-6 text-center text-sm text-muted-foreground">
        {t('transactions.searchPanel.noMatch', { query })}
      </p>
    );
  }

  const total = transactions.data.meta.total;

  return (
    <div className="flex flex-col">
      {rows.map((transaction) => (
        <ResultRow key={transaction.id} transaction={transaction} tree={tree} onSelect={onSelect} />
      ))}

      {/* How many of the ones that fit there are. Without this, twenty results out of
          three hundred read as three hundred. */}
      {total > rows.length && (
        <p className="px-3 pt-3 text-center text-xs text-muted-foreground">
          {t('transactions.searchPanel.latest', { shown: rows.length, total })}
        </p>
      )}
    </div>
  );
}

function ResultRow({
  transaction,
  tree,
  onSelect,
}: {
  transaction: Transaction;
  tree: Category[];
  onSelect: (transaction: Transaction) => void;
}) {
  return (
    <PanelRow onClick={() => onSelect(transaction)}>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{transactionName(transaction, tree)}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {shortDay(transaction.date)}
        </span>
      </span>
      <Amount
        amount={transaction.amount}
        currency={transaction.currency}
        direction={transactionDirection(transaction.type)}
        className="shrink-0 text-sm"
      />
    </PanelRow>
  );
}

function SearchHead({ text, onChange }: { text: string; onChange: (text: string) => void }) {
  return (
    <div className="relative">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        type="search"
        autoFocus
        value={text}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('transactions.searchPanel.placeholder')}
        aria-label={t('transactions.searchPanel.label')}
        className="pl-9"
      />
    </div>
  );
}

/** What is typed, and the query that comes out of it with a small delay. */
function useDebouncedSearch(isOpen: boolean) {
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');

  // Every opening starts blank. Reopening with last time's text would show
  // the results of a question that is no longer being asked.
  useOnChange([isOpen], () => {
    if (!isOpen) {
      setText('');
      setQuery('');
    }
  });

  // It is typed locally and queried with a delay: without this every key fires
  // a request and the list flickers while typing.
  useEffect(() => {
    const id = setTimeout(() => setQuery(text.trim()), 300);
    return () => clearTimeout(id);
  }, [text]);

  return { text, setText, query };
}
