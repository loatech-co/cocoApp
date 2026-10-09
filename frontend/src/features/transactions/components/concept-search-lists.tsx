import { useId, type ReactNode } from 'react';

import type { ReceiptCandidate } from '@/features/transactions/model/movement-form';
import { t } from '@/shared/lib/i18n';
import { TextButton } from '@/shared/ui/atoms/text-button';
import { CreateOption, Option } from '@/shared/ui/organisms/combo';
import { readablePath, type IndexEntry } from '@coco/receipt-parser';

/** The step of picking which category the concept about to be created goes in. */
export function CategoryForNew({
  newName,
  categories,
  onBack,
  onCreateIn,
}: {
  newName: string;
  categories: IndexEntry[];
  onBack: () => void;
  onCreateIn: (category: IndexEntry) => void;
}) {
  return (
    <>
      <div className="flex items-center justify-between gap-2 px-3 pt-2 text-xs text-muted-foreground">
        <span className="min-w-0 truncate">
          {t('transactions.conceptSearch.whichCategory', { name: newName })}
        </span>
        <TextButton tone="highlight" onClick={onBack}>
          {t('transactions.conceptSearch.back')}
        </TextButton>
      </div>
      {categories.length === 0 ? (
        <Empty>{t('transactions.conceptSearch.noCategory')}</Empty>
      ) : (
        <div
          className={LIST}
          role="listbox"
          aria-label={t('transactions.conceptSearch.categories')}
        >
          {categories.map((c) => (
            <Option key={String(c.id)} isSelected={false} onClick={() => onCreateIn(c)}>
              <Row input={c} />
            </Option>
          ))}
        </div>
      )}
    </>
  );
}

export interface ResultsProps {
  query: string;
  results: IndexEntry[];
  recent: IndexEntry[];
  candidates: readonly ReceiptCandidate[];
  chosen: IndexEntry | undefined;
  canCreate: boolean;
  isCreating: boolean;
  onSelect: (e: IndexEntry | undefined) => void;
  onSelectCandidate: (c: ReceiptCandidate) => void;
  onRequestCategory: () => void;
}

/** What is offered while searching: what came from the receipt, the recent or the matches, and create. */
export function SearchResults(props: ResultsProps) {
  const { query, results, chosen, canCreate, onSelect } = props;
  const isSearching = query.trim() !== '';

  return (
    <>
      {hasOptions(props) ? (
        <div className={LIST} role="listbox" aria-label={t('transactions.conceptSearch.results')}>
          {chosen && (
            <Option isSelected={false} onClick={() => onSelect(undefined)}>
              <span className="text-muted-foreground">
                {t('transactions.conceptSearch.remove')}
              </span>
            </Option>
          )}

          {!isSearching && <NotSearching {...props} />}

          {isSearching &&
            results.map((r) => (
              <Option
                key={String(r.id)}
                isSelected={chosen?.id === r.id}
                onClick={() => onSelect(r)}
              >
                <Row input={r} />
              </Option>
            ))}
        </div>
      ) : (
        !(isSearching && canCreate) && (
          <Empty>
            {isSearching
              ? t('transactions.conceptSearch.nothingMatches')
              : t('transactions.conceptSearch.typeToSearch')}
          </Empty>
        )
      )}

      {isSearching && canCreate && (
        <CreateConcept
          query={query}
          isCreating={props.isCreating}
          hasNoResults={results.length === 0}
          onRequestCategory={props.onRequestCategory}
        />
      )}
    </>
  );
}

/** With the box blank: what the receipt left, or what was used lately. */
function NotSearching({ candidates, recent, chosen, onSelect, onSelectCandidate }: ResultsProps) {
  return (
    <>
      {candidates.length > 0 && (
        <Group title={t('transactions.conceptSearch.fromReceipt')}>
          {candidates.map((c) => (
            <Option
              key={c.id}
              isSelected={chosen !== undefined && String(chosen.id) === String(c.id)}
              onClick={() => onSelectCandidate(c)}
            >
              <span className="flex min-w-0 items-baseline gap-2">
                <span className="truncate">{c.name}</span>
                <span className="truncate text-xs text-muted-foreground">{c.path}</span>
              </span>
            </Option>
          ))}
        </Group>
      )}

      {candidates.length === 0 && recent.length > 0 && (
        <Group title={t('transactions.conceptSearch.recent')}>
          {recent.map((r) => (
            <Option key={String(r.id)} isSelected={chosen?.id === r.id} onClick={() => onSelect(r)}>
              <Row input={r} />
            </Option>
          ))}
        </Group>
      )}
    </>
  );
}

function CreateConcept({
  query,
  isCreating,
  hasNoResults,
  onRequestCategory,
}: {
  query: string;
  isCreating: boolean;
  hasNoResults: boolean;
  onRequestCategory: () => void;
}) {
  return (
    <CreateOption isCreating={isCreating} hasEnterHint={hasNoResults} onCreate={onRequestCategory}>
      {t('transactions.conceptSearch.createConcept', { name: query.trim() })}
    </CreateOption>
  );
}

/** Name and path. A category is marked so it is not mistaken for a concept. */
function Row({ input }: { input: IndexEntry }) {
  return (
    <span className="flex min-w-0 items-baseline gap-2">
      <span className="truncate">{input.name}</span>
      {input.path.length > 0 && (
        <span className="truncate text-xs text-muted-foreground">{readablePath(input)}</span>
      )}
      {input.level === 'categoria' && (
        <span className="ml-auto shrink-0 text-xs text-muted-foreground">
          {t('transactions.conceptSearch.category')}
        </span>
      )}
    </span>
  );
}

/*
  ── The shape of the list: options, and nothing else ─────────────────────────
  A `listbox` can only contain options or groups of options. It was a
  `<ul>` with each option inside an `<li>` —a screen reader found
  «list item» between the list and the option—, and with the labels and the
  «Nada coincide» as more rows. Now the options hang straight from
  the list, the labels name a `group`, and the empty case is said OUTSIDE the
  list, which is then not drawn: a list with no options is not a list.
*/
const LIST = 'max-h-64 overflow-y-auto p-1';

/** There is something to offer in the results list. */
function hasOptions({ query, results, recent, candidates, chosen }: ResultsProps): boolean {
  if (chosen) return true;
  if (query.trim() !== '') return results.length > 0;
  return candidates.length > 0 || recent.length > 0;
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <div role="group" aria-labelledby={id}>
      <div id={id} className="px-2.5 pb-1 pt-2 text-xs text-muted-foreground">
        {title}
      </div>
      {children}
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="px-3.5 py-3 text-sm text-muted-foreground">{children}</p>;
}
