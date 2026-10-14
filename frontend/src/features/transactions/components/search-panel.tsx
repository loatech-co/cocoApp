import { Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { useTransactions } from '@/features/transactions/api/transactions';
import { selectedPath, transactionName } from '@/features/transactions/model/transactions';
import { useCategories } from '@/shared/api/categories';
import { type Category, type Transaction } from '@/shared/api/generated/model';
import { shortDay } from '@/shared/lib/format';
import { t } from '@/shared/lib/i18n';
import { useOnChange } from '@/shared/lib/on-change';
import { ErrorAlert } from '@/shared/ui/atoms/alert';
import { BottomSheet } from '@/shared/ui/atoms/bottom-sheet';
import { Button } from '@/shared/ui/atoms/button';
import { Input } from '@/shared/ui/atoms/input';
import { PanelRow } from '@/shared/ui/atoms/panel-row';
import { Skeleton } from '@/shared/ui/atoms/skeleton';

import { AmountText } from './transaction-row-parts';

/** How many results fit before the list stops being an answer. */
const MAX_RESULTS = 20;

/** How many of the latest show before anything is typed. */
const LATEST = 10;

/**
 * Search for a transaction, from any screen.
 *
 * It asks the API's transactions list —the same `q` the table filters with:
 * the description, the merchant, the notes and the names of the categories—
 * newest first, and the found transaction opens in its sheet.
 *
 * ── Why it is a sheet and not a screen ──────────────────────────────────────
 * Because searching is not going somewhere else: it is looking up for a moment without
 * letting go of what you were doing. A results screen forces coming back
 * with the back button, and on the way back the previous screen has already lost the place
 * where it was.
 *
 * ── Why it opens on the LATEST, not on a hint ───────────────────────────────
 * Most of the time what is looked for is something just recorded: the
 * expense of an hour ago, to add its receipt or fix its amount. Opening on
 * the ten latest answers that without typing; a word is for the rest.
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
      head={<SearchHead isOpen={isOpen} text={text} onChange={setText} />}
      onClose={onClose}
    >
      {/*
        The lists only mount while the sheet is open. The sheet is ALWAYS
        mounted —open or closed, so it can slide—, so a query written in
        here would fire on every phone screen even if nobody has touched the
        magnifier.
      */}
      {isOpen && <SearchBody query={query} onSelect={onSelect} />}
    </BottomSheet>
  );
}

function SearchBody({
  query,
  onSelect,
}: {
  query: string;
  onSelect: (transaction: Transaction) => void;
}) {
  const isLatest = query === '';
  const transactions = useTransactions(
    isLatest
      ? { perPage: LATEST, sort: '-date' }
      : { q: query, perPage: MAX_RESULTS, sort: '-date' },
  );
  const tree = useCategories().data ?? [];

  if (transactions.isPending) return <ListSkeleton />;

  if (transactions.isError) return <SearchFailed onRetry={() => void transactions.refetch()} />;

  const rows = transactions.data.data;
  const total = transactions.data.meta.total;

  if (rows.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        {isLatest
          ? t('transactions.searchPanel.help')
          : t('transactions.searchPanel.noMatch', { query })}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <ListLabel isLatest={isLatest} total={total} />
      {rows.map((transaction) => (
        <ResultRow key={transaction.id} transaction={transaction} tree={tree} onSelect={onSelect} />
      ))}

      {/* How many of the ones that fit there are. Without this, twenty results out of
          three hundred read as three hundred. */}
      {!isLatest && total > rows.length && (
        <p className="pt-3 text-center text-xs text-muted-foreground">
          {t('transactions.searchPanel.latest', { shown: rows.length, total })}
        </p>
      )}
    </div>
  );
}

/** The search failed: say so, and offer to try again. */
function SearchFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col gap-3">
      <ErrorAlert message={t('transactions.searchPanel.failed')} />
      <Button type="button" variant="outline" onClick={onRetry}>
        {t('transactions.supports.retry')}
      </Button>
    </div>
  );
}

/** What the list is: the latest, or how many matched. */
function ListLabel({ isLatest, total }: { isLatest: boolean; total: number }) {
  const label = isLatest
    ? t('transactions.searchPanel.recentTitle')
    : total === 1
      ? t('transactions.searchPanel.resultsOne')
      : t('transactions.searchPanel.resultsMany', { n: total });

  return (
    <p aria-live="polite" className="pb-1 text-xs font-semibold text-muted-foreground">
      {label}
    </p>
  );
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-2 py-1">
      {[0, 1, 2, 3, 4].map((i) => (
        <Skeleton key={i} className="h-12 rounded-lg" />
      ))}
    </div>
  );
}

/**
 * One transaction: its name and its amount, as a row of the phone table, and
 * below them the date and where it is classified.
 */
function ResultRow({
  transaction,
  tree,
  onSelect,
}: {
  transaction: Transaction;
  tree: Category[];
  onSelect: (transaction: Transaction) => void;
}) {
  const { costCenter, category } = selectedPath(tree, transaction.categoryId ?? undefined);
  const place = [costCenter?.name, category?.name].filter(Boolean).join(' › ');

  return (
    <PanelRow onClick={() => onSelect(transaction)}>
      <span className="min-w-0 flex-1 py-1.5">
        <span className="block truncate font-medium">{transactionName(transaction, tree)}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {place ? `${shortDay(transaction.date)} · ${place}` : shortDay(transaction.date)}
        </span>
      </span>
      <AmountText transaction={transaction} />
    </PanelRow>
  );
}

function SearchHead({
  isOpen,
  text,
  onChange,
}: {
  isOpen: boolean;
  text: string;
  onChange: (text: string) => void;
}) {
  const field = useRef<HTMLInputElement>(null);

  // `autoFocus` only acts when the field is BORN, and this one is born once,
  // with the sheet closed. So on every opening it is focused by hand, a tick
  // later: the sheet first takes the focus into its box (`useFocusTrap`).
  useEffect(() => {
    if (!isOpen) return;
    const id = setTimeout(() => field.current?.focus(), 0);
    return () => clearTimeout(id);
  }, [isOpen]);

  return (
    <div className="relative">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        ref={field}
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

  // Emptied, the latest come back at once: there is nothing to wait for.
  return { text, setText, query: text.trim() === '' ? '' : query };
}
