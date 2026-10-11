import { ChevronDown } from 'lucide-react';
import { useEffect, useRef, type RefObject } from 'react';

import { useConceptSearch } from '@/features/transactions/hooks/use-concept-search';
import type { ReceiptCandidate } from '@/features/transactions/model/transaction-form';
import { t } from '@/shared/lib/i18n';
import type { TreeNode } from '@/shared/lib/searchable-tree';
import { cn } from '@/shared/lib/utils';
import { Field } from '@/shared/ui/atoms/field';
import { SearchBox } from '@/shared/ui/atoms/search-box';
import { fieldTrigger, useInsideField } from '@/shared/ui/foundations/field';
import { Menu } from '@/shared/ui/molecules/menu';
import { readablePath, type IndexEntry } from '@coco/receipt-parser';

import { CategoryForNew, SearchResults, type ResultsProps } from './concept-search-lists';

interface ConceptSearchProps {
  id: string;
  tree: readonly TreeNode[];
  /** The picked id: a concept or a category. */
  value: number | undefined;
  onSelect: (id: number | undefined) => void;
  /** Create a concept with that name inside that category, and pick it. */
  onCreateConcept: (name: string, categoryId: number) => void;
  isCreating?: boolean;
  /** In a static center: what was picked is shown, but it is not changed from here. */
  disabled?: boolean;
  /** Ids of the concepts used lately, from the most recent to the oldest. */
  recent?: readonly number[];
  /** What reading a receipt left to choose between. */
  candidates?: readonly ReceiptCandidate[];
  /** Under the field: «sugerido por tu historial», an error… */
  description?: string | undefined;
}

/**
 * A single search to classify a transaction.
 *
 * ── The problem it solves ───────────────────────────────────────────────────
 * Classifying asked for three cascading dropdowns —center, category, concept—
 * and seven interactions to get an expense properly set. Here you type «d1»
 * and «Mercado · Alimentación › Costos variables» shows up: one click, and the three
 * levels are set, because picking a concept already says which category and
 * which center it belongs to.
 *
 * ── What is searched ────────────────────────────────────────────────────────
 * Concepts and categories, by name and by keyword, regardless of accents or
 * capitals. Each result shows its path, which is what tells two
 * «Mercado» apart. Picking a category is valid too: there are accounts with categories and
 * no concepts, and there the category is the finest thing that can be said.
 *
 * ── With the search blank ───────────────────────────────────────────────────
 * What the person used lately, up to five. Almost all of someone's
 * expenses go to the same five concepts, and having them in front is zero
 * keystrokes. If reading a receipt left candidates to choose between,
 * those go first: they are the question the screen is asking.
 *
 * ── When there is nothing ───────────────────────────────────────────────────
 * It offers to create the concept with what was typed. Since a concept hangs from a
 * category, only that is asked: which category it goes in. A cost center
 * is never created from here —it is the top structure, and it is defined three
 * times in the life of an account—.
 *
 * ── On top of `Menu`, like every dropdown in this app ───────────────────────
 * It is the one that knows how to open, close on an outside tap, close with Escape and place itself.
 * The pickable row is the same `Option` as `Combo`'s, so that picking looks
 * the same in both places.
 */
export function ConceptSearch({
  id,
  tree,
  value,
  onSelect,
  onCreateConcept,
  isCreating = false,
  disabled: isDisabled = false,
  recent = [],
  candidates = [],
  description,
}: ConceptSearchProps) {
  const b = useConceptSearch({ tree, value, recent });
  const field = useRef<HTMLInputElement>(null);

  if (isDisabled) {
    return (
      <Field label={t('transactions.fields.concept')} id={id} description={description}>
        <LockedConcept id={id} chosen={b.chosen} />
      </Field>
    );
  }

  return (
    <Field label={t('transactions.fields.concept')} id={id} description={description}>
      <Menu
        label={t('transactions.fields.concept')}
        kind="search"
        align="left"
        isFloating
        isUnpadded
        boxClassName="w-full min-w-0"
        triggerClassName={fieldTrigger()}
        triggerId={id}
        trigger={({ isOpen }) => <ConceptSearchValue chosen={b.chosen} isOpen={isOpen} />}
      >
        {(close) => (
          <MenuPanel
            searchBox={b}
            field={field}
            candidates={candidates}
            isCreating={isCreating}
            close={close}
            onSelect={onSelect}
            onCreateConcept={onCreateConcept}
          />
        )}
      </Menu>
    </Field>
  );
}

interface MenuPanelProps {
  searchBox: ReturnType<typeof useConceptSearch>;
  field: RefObject<HTMLInputElement | null>;
  candidates: readonly ReceiptCandidate[];
  isCreating: boolean;
  close: () => void;
  onSelect: (id: number | undefined) => void;
  onCreateConcept: (name: string, categoryId: number) => void;
}

/** The open panel, with what to do on picking: clear and close. */
function MenuPanel({
  searchBox: b,
  field,
  candidates,
  isCreating,
  close,
  onSelect,
  onCreateConcept,
}: MenuPanelProps) {
  const finish = (): void => {
    b.clear();
    close();
  };

  return (
    <Panel
      field={field}
      query={b.query}
      setQuery={b.setQuery}
      mode={b.mode}
      results={b.results}
      recent={b.recentEntries}
      candidates={candidates}
      categories={b.filteredCategories}
      chosen={b.chosen}
      canCreate={b.canCreate}
      isCreating={isCreating}
      onSelect={(e) => {
        onSelect(e === undefined ? undefined : Number(e.id));
        finish();
      }}
      onSelectCandidate={(c) => {
        onSelect(c.id);
        finish();
      }}
      newName={b.newName}
      onRequestCategory={b.askForCategory}
      onBack={b.back}
      onCreateIn={(category) => {
        onCreateConcept(b.newName, Number(category.id));
        finish();
      }}
    />
  );
}

/** In a static center: what was picked is shown, but it opens nothing. */
function LockedConcept({ id, chosen }: { id: string; chosen: IndexEntry | undefined }) {
  return (
    <span
      id={id}
      aria-disabled="true"
      className={cn(fieldTrigger(), 'cursor-not-allowed opacity-50')}
    >
      <ConceptSearchValue chosen={chosen} isOpen={false} />
    </span>
  );
}

/*
  What shows in the field, open or closed, whether it can be touched or not.

  One and not two, as in `Combo`: locked means «this is not changed
  from here», never «this is empty». A transaction from a static center
  has to read as classified even though it cannot be reclassified.
*/
function ConceptSearchValue({
  chosen,
  isOpen,
}: {
  chosen: IndexEntry | undefined;
  isOpen: boolean;
}) {
  const isInField = useInsideField();
  return (
    <>
      <span
        data-filled={chosen ? 'yes' : 'no'}
        data-empty={chosen ? undefined : ''}
        className={cn(
          'flex min-w-0 flex-1 items-baseline gap-2 text-left',
          !chosen && 'text-muted-foreground',
          isInField && 'pt-4',
        )}
      >
        <span className="truncate">
          {chosen?.name ?? t('transactions.conceptSearch.placeholder')}
        </span>
        {chosen && chosen.path.length > 0 && (
          <span className="hidden truncate text-xs text-muted-foreground sm:inline">
            {readablePath(chosen)}
          </span>
        )}
      </span>
      <ChevronDown
        className={cn('size-4 shrink-0 opacity-60 transition-transform', isOpen && 'rotate-180')}
        aria-hidden="true"
      />
    </>
  );
}

interface PanelProps extends ResultsProps {
  field: RefObject<HTMLInputElement | null>;
  setQuery: (v: string) => void;
  mode: 'buscar' | 'categoria-para-nuevo';
  categories: IndexEntry[];
  newName: string;
  onBack: () => void;
  onCreateIn: (category: IndexEntry) => void;
}

function Panel(props: PanelProps) {
  const { field, mode } = props;

  // Focus on opening: it is a search box that appears because searching was asked for, the
  // exception the focus rule allows. If the field had to be pressed
  // before typing, the gesture would be two clicks.
  useEffect(() => {
    const t = setTimeout(() => field.current?.focus(), 10);
    return () => clearTimeout(t);
  }, [field, mode]);

  return (
    <div className="flex flex-col">
      <ConceptSearchBox {...props} />

      {mode === 'categoria-para-nuevo' ? (
        <CategoryForNew
          newName={props.newName}
          categories={props.categories}
          onBack={props.onBack}
          onCreateIn={props.onCreateIn}
        />
      ) : (
        <SearchResults {...props} />
      )}
    </div>
  );
}

function ConceptSearchBox(props: PanelProps) {
  const { field, query, setQuery, categories, results, canCreate } = props;
  const isChoosingCategory = props.mode === 'categoria-para-nuevo';

  return (
    <SearchBox
      shape="header"
      ref={field}
      value={query}
      onChange={(e) => setQuery(e.target.value)}
      onKeyDown={(e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        if (isChoosingCategory) {
          const [isOnly] = categories;
          if (categories.length === 1 && isOnly !== undefined) props.onCreateIn(isOnly);
          return;
        }
        // Enter picks the only thing left, which is what you expect after
        // typing three letters and seeing a single row. With no rows, it goes to create.
        if (results.length === 1) props.onSelect(results[0]);
        else if (results.length === 0 && canCreate) props.onRequestCategory();
      }}
      placeholder={
        isChoosingCategory
          ? t('transactions.conceptSearch.filterCategoriesPlaceholder')
          : t('transactions.conceptSearch.searchPlaceholder')
      }
      aria-label={
        isChoosingCategory
          ? t('transactions.conceptSearch.filterCategories')
          : t('transactions.conceptSearch.placeholder')
      }
    />
  );
}
