import { Search, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import type { Filters } from '@/features/transactions/model/filters';
import type { SortOrder } from '@/features/transactions/model/sort-orders';
import { useCategories } from '@/shared/api/categories';
import { type TransactionType } from '@/shared/api/generated/model';
import { t } from '@/shared/lib/i18n';
import { useIsMobile } from '@/shared/lib/mobile';
import { useOnChange } from '@/shared/lib/on-change';
import { BottomSheet } from '@/shared/ui/atoms/bottom-sheet';
import { Button } from '@/shared/ui/atoms/button';
import { Input } from '@/shared/ui/atoms/input';
import { PageHeader } from '@/shared/ui/atoms/page-header';

import { DateSelector } from './date-selector';
import { ClassificationMenu, NewTransactionMenu, SortMenu } from './toolbar-menus';

interface ToolbarFiltersProps {
  title: string;
  /** What is being viewed, in one line. E.g.: "377 movimientos". */
  subtitle?: string;
  /** Alias of `subtitle`, for compatibility with the existing calls. */
  summary?: string;
  filters: Filters;
  apply: (changes: Partial<Filters>) => void;
  clear: () => void;
  hasActiveFilters: boolean;
  /** Only where sorting means something: a list. */
  sort?: { value: SortOrder; onChange: (value: SortOrder) => void };
  /** The screen's own buttons, at the far right. */
  /**
   * Record a new transaction, of the type chosen.
   *
   * It lives here and not in a floating button because a floating button does not say
   * WHICH screen it belongs to: it covered a corner of all of them alike, including
   * those where recording a transaction means nothing. Next to the
   * cut, on the other hand, it reads as what it is: what can be done with what
   * is being looked at.
   */
  onNew?: (type: TransactionType) => void;
  actions?: ReactNode;
}

/**
 * The header with the filters shared by the Resumen and the Movimientos.
 *
 * ── Why the title lives in here ─────────────────────────────────────────────
 * Because the title and the cut are the same sentence: "Movimientos · 377 de
 * 2022 a 2026". Splitting them into two blocks leaves the what on top and the how much
 * below, and forces looking in two places to know what is being viewed.
 *
 * ── Why the controls are icons and not a row of fields ──────────────────────
 * Because they are almost always empty. A row of always-visible selectors
 * takes the whole width to say "all, all, all"; folded behind
 * an icon, the content keeps the space, and the icon lights up when
 * something is set.
 *
 * ── Why it is the SAME component on both screens ────────────────────────────
 * Because they are two views of the same cut. If the dashboard filtered differently from
 * the list, the figures on top would not explain the rows below and you would have
 * to distrust both.
 */
export function ToolbarFilters(props: ToolbarFiltersProps) {
  const { title, subtitle, summary, filters, apply, clear, hasActiveFilters } = props;
  const { sort, onNew, actions } = props;
  const categories = useCategories();
  const isMobile = useIsMobile();
  const search = useToolbarSearch(filters, apply);

  return (
    <PageHeader
      title={title}
      description={subtitle ?? summary}
      align="bottom"
      actions={
        /*
        ── The whole row, on the phone ─────────────────────────────────────
        `w-full` and no wrapping: the three controls that remain —search,
        filter and the range— fit on one line, and the range keeps the
        leftover space because its label is a fact and not a fixed word.

        Wrapping, a fourth control pushed the range to a second line all
        alone, aligned to the right and with half an empty row on its left.
      */
        <div className="flex w-full items-center gap-2 sm:w-auto sm:flex-wrap">
          {/* ── Search ───────────────────────────────────────────────────── */}
          {isMobile ? (
            <PhoneSearch search={search} isFiltering={(filters.q ?? '') !== ''} />
          ) : (
            <DesktopSearch search={search} />
          )}

          {/* ── Sort ─────────────────────────────────────────────────────── */}
          {sort && <SortMenu sort={sort} />}

          {/* ── Classification ───────────────────────────────────────────── */}
          <ClassificationMenu tree={categories.data ?? []} filters={filters} apply={apply} />

          <DateSelector
            isRange
            hasShortcuts
            filters={filters}
            apply={apply}
            boxClassName="movil:min-w-0 movil:flex-1"
          />

          {hasActiveFilters && <ClearFiltersButton onClick={clear} />}

          {/*
          ── And on the phone it is NOT here ────────────────────────────────
          Recording a transaction lives in the (+) at the center of the bottom
          bar, which is always in sight and always in the same place, whatever
          the screen. Up here it was the same button repeated, and in
          a row of four controls it was the one that fit least.
        */}
          {onNew && !isMobile && <NewTransactionMenu onNew={onNew} />}

          {actions}
        </div>
      }
    />
  );
}

/** What is typed in the search, whether the field is open, and the field itself. */
function useToolbarSearch(filters: Filters, apply: (changes: Partial<Filters>) => void) {
  // The search is typed locally and sent with a delay: without this every key
  // would fire a query and the list would flicker while typing.
  const [text, setText] = useState(filters.q ?? '');

  // The field starts folded and opens on pressing the magnifier. It stays open
  // while there is something typed: folding it would hide the filter that is
  // cutting the screen, and there would be no way to know why rows are missing.
  const [isSearching, setIsSearching] = useState((filters.q ?? '') !== '');
  const field = useRef<HTMLInputElement>(null);

  useOnChange([filters.q], () => {
    setText(filters.q ?? '');
    // If the filter arrives set from the URL, the field has to be in
    // sight: an active cut that cannot be seen cannot be removed.
    if ((filters.q ?? '') !== '') setIsSearching(true);
  });

  useEffect(() => {
    const id = setTimeout(() => {
      if ((filters.q ?? '') !== text) apply({ q: text });
    }, 300);
    return () => clearTimeout(id);
  }, [text, filters.q, apply]);

  return { text, setText, isSearching, setIsSearching, field };
}

type ToolbarSearch = ReturnType<typeof useToolbarSearch>;

/*
  On the phone the field does not unfold IN the row: a sheet lifts it,
  same as the filter and the range. A field that appears in the middle of a row of
  icons pushes the other three off the screen, and the system keyboard
  comes up right on top of the list being cut.
*/
function PhoneSearch({ search, isFiltering }: { search: ToolbarSearch; isFiltering: boolean }) {
  const { text, setText, isSearching, setIsSearching, field } = search;
  return (
    <>
      <Button
        type="button"
        variant="tool"
        size="sm-icon"
        aria-label={t('shell.bottomBar.search')}
        aria-pressed={isSearching || isFiltering}
        aria-expanded={isSearching}
        onClick={() => setIsSearching(true)}
      >
        <Search className="size-4" aria-hidden="true" />
      </Button>

      <BottomSheet
        isOpen={isSearching}
        title={t('shell.bottomBar.search')}
        head={
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
              onChange={(e) => setText(e.target.value)}
              placeholder={t('transactions.searchPanel.placeholder')}
              aria-label={t('transactions.toolbar.searchByKeyword')}
              className="pl-9"
            />
          </div>
        }
        onClose={() => setIsSearching(false)}
      >
        {/* What this does, and not what the magnifier in the bottom bar does.
          Both look the same and answer different questions: that one
          SEARCHES for a transaction across the whole app; this one CUTS what
          is being looked at, and what is typed stays set on closing. */}
        <p className="px-3 py-2 text-sm text-muted-foreground">
          {t('transactions.toolbar.searchHelp')}
        </p>
      </BottomSheet>
    </>
  );
}

function DesktopSearch({ search }: { search: ToolbarSearch }) {
  const { text, setText, isSearching, setIsSearching, field } = search;

  if (!isSearching) {
    return (
      <Button
        type="button"
        variant="tool"
        size="sm-icon"
        aria-label={t('shell.bottomBar.search')}
        title={t('shell.bottomBar.search')}
        onClick={() => {
          setIsSearching(true);
          // Focus is not inherited from an element that was just born.
          setTimeout(() => field.current?.focus(), 0);
        }}
      >
        <Search className="size-4" aria-hidden="true" />
      </Button>
    );
  }

  return (
    <div className="relative min-w-0 flex-1 sm:w-64 sm:flex-none">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        ref={field}
        type="search"
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => text === '' && setIsSearching(false)}
        placeholder={t('transactions.searchPanel.placeholder')}
        aria-label={t('transactions.toolbar.searchByKeyword')}
        className="h-9 rounded-lg pl-9"
      />
    </div>
  );
}

function ClearFiltersButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="tool"
      size="sm-icon"
      aria-label={t('transactions.toolbar.clearFilters')}
      title={t('transactions.toolbar.clearFilters')}
      onClick={onClick}
    >
      <X className="size-4" aria-hidden="true" />
    </Button>
  );
}
