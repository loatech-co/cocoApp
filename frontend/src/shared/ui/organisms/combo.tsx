import { Check, ChevronDown, CornerDownLeft, Plus } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { t } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { SearchBox } from '@/shared/ui/atoms/search-box';
import { fieldTrigger, useInsideField } from '@/shared/ui/foundations/field';
import { HIGHLIGHT } from '@/shared/ui/foundations/surface';
import { Menu } from '@/shared/ui/molecules/menu';

/**
 * A dropdown you type into.
 *
 * ── Why the `Select` is not enough ──────────────────────────────────────────
 * Because a list of forty concepts is not browsed with the mouse wheel. Typing
 * three letters leaves one, and that is the gesture everyone has searched with
 * for twenty years. The `Select` is still the right one where there are five
 * options and they fit at a glance.
 *
 * ── Why "create" lives in here ──────────────────────────────────────────────
 * Because the moment one discovers that a concept does not exist is exactly
 * the moment one is looking for it. Sending them to another screen to create
 * it —and to come back, and to search again— is where the task gets
 * abandoned.
 *
 * And it is OPTIONAL on purpose: it is not offered for cost centers. A center
 * is the top structure, it is defined three times in the life of an account,
 * and being able to invent one on the fly while recording an expense is how
 * accounts end up with "Casa", "casa" and "Hogar" being the same thing.
 *
 * ── No operating system control ─────────────────────────────────────────────
 * It is built on `menu.tsx`, like everything that drops down in this app: it
 * is the one that knows how to close on a tap outside, with Escape, and how
 * to break out of the box that contains it when the modal scrolls.
 */

interface ComboOption {
  value: string;
  label: string;
}

interface ComboProps {
  /** Accessible name. Not painted: the visible label goes outside. */
  label: string;
  /** The selected value. `''` is none. */
  value: string;
  options: ComboOption[];
  onChange: (value: string) => void;
  /** If passed, creating what does not exist is offered. */
  onCreate?: (name: string) => void;
  emptyLabel?: string;
  disabled?: boolean;
  /** While creating, so it cannot be pressed twice. */
  isCreating?: boolean;
  id?: string;
}

export function Combo({
  label,
  value,
  options,
  onChange,
  onCreate,
  emptyLabel = t('ui.combo.notChosen'),
  disabled: isDisabled = false,
  isCreating = false,
  id,
}: ComboProps) {
  const search = useComboSearch(options, onChange, onCreate);
  const inputRef = useRef<HTMLInputElement>(null);
  const isInField = useInsideField();

  const selected = options.find((o) => o.value === value);

  /*
    What shows in the field, open or closed, whether it can be touched or not.

    ── Why it is ONE and not two ──────────────────────────────────────────
    It was written twice, and the two copies said different things: the one
    for the locked control ALWAYS painted the placeholder and ignored the
    selection. In the modal of a transaction from a static center —where the
    three dropdowns come out locked on purpose, because that classification is
    not touched from here— that meant opening a well-classified transaction
    and reading «Elige una opción» in center, category and concept. The form
    said it was not classified, which is exactly the opposite of what was
    happening.

    Locked means «this is not changed from here», never «this is empty». It
    is the same shape `Select` already had, which did reuse its content.
  */
  const triggerContent = (isOpen: boolean) => (
    <ComboTriggerContent
      selected={selected}
      emptyLabel={emptyLabel}
      isInField={isInField}
      isOpen={isOpen}
    />
  );

  // Locked cannot be a button that opens anything: it is painted the same but
  // with no dropdown behind it, so that focus does not fall into a trap.
  if (isDisabled) return <DisabledCombo id={id}>{triggerContent(false)}</DisabledCombo>;

  return (
    <Menu
      label={label}
      kind="list"
      align="left"
      isFloating
      // The panel draws its own full-bleed strips —the search box on top, the
      // "create" at the bottom—: with the menu's padding, those lines would
      // stop 4px short of each side.
      isUnpadded
      boxClassName="w-full min-w-0"
      triggerClassName={fieldTrigger()}
      triggerId={id}
      trigger={({ isOpen }) => triggerContent(isOpen)}
    >
      {(close) => (
        <ComboPanel
          inputRef={inputRef}
          search={search}
          value={value}
          emptyLabel={emptyLabel}
          isCreating={isCreating}
          close={close}
        />
      )}
    </Menu>
  );
}

interface ComboSearch {
  query: string;
  setQuery: (v: string) => void;
  filtered: ComboOption[];
  canCreate: boolean;
  /** Picks an option and empties the search box. */
  select: (value: string) => void;
  /** Creates what was typed and empties the search box. */
  create: () => void;
}

/** What was typed in the search box, what it lets through and what can be created with it. */
function useComboSearch(
  options: ComboOption[],
  onChange: (value: string) => void,
  onCreate: ((name: string) => void) | undefined,
): ComboSearch {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = normal(query);
    if (q === '') return options;
    return options.filter((o) => normal(o.label).includes(q));
  }, [options, query]);

  // Offer to create only when what was typed does not exist yet. With a
  // matching name, "create" would produce two identical concepts —and from
  // then on the same money adding up separately in both—.
  const canCreate =
    onCreate !== undefined &&
    query.trim() !== '' &&
    !options.some((o) => normal(o.label) === normal(query));

  return {
    query,
    setQuery,
    filtered,
    canCreate,
    select: (v) => {
      onChange(v);
      setQuery('');
    },
    create: () => {
      onCreate?.(query.trim());
      setQuery('');
    },
  };
}

interface ComboPanelProps {
  inputRef: React.RefObject<HTMLInputElement | null>;
  search: ComboSearch;
  value: string;
  emptyLabel: string;
  isCreating: boolean;
  close: () => void;
}

function ComboPanel({ inputRef, search, value, emptyLabel, isCreating, close }: ComboPanelProps) {
  const { query, setQuery, filtered, canCreate } = search;

  // Focus on open: if the field has to be clicked before typing, the gesture
  // is two clicks and nobody ever discovers that it could filter.
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 10);
    return () => clearTimeout(t);
  }, [inputRef]);

  function onSelect(v: string): void {
    search.select(v);
    close();
  }

  function onCreate(): void {
    search.create();
    close();
  }

  return (
    <div className="flex flex-col">
      <SearchBox
        shape="header"
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          // Enter picks the only thing left, which is what one expects after
          // typing three letters and seeing a single row.
          if (e.key !== 'Enter') return;
          e.preventDefault();
          const [only] = filtered;
          if (filtered.length === 1 && only !== undefined) onSelect(only.value);
          else if (canCreate) onCreate();
        }}
        placeholder={t('ui.combo.search')}
      />

      <ComboOptions
        filtered={filtered}
        value={value}
        emptyLabel={emptyLabel}
        canCreate={canCreate}
        onSelect={onSelect}
      />

      {canCreate && (
        <CreateOption isCreating={isCreating} onCreate={onCreate}>
          {t('ui.combo.create', { name: query.trim() })}
        </CreateOption>
      )}
    </div>
  );
}

/**
 * The «create what is missing» row, at the foot of a list with a search box.
 *
 * Exported because the concept search offers the same: two copies drift
 * apart. `hasEnterHint` adds the hint that Enter picks it, when it is the only
 * thing that can be picked.
 */
export function CreateOption({
  isCreating,
  hasEnterHint = false,
  onCreate,
  children,
}: {
  isCreating: boolean;
  hasEnterHint?: boolean;
  onCreate: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onCreate}
      disabled={isCreating}
      className={cn(
        'flex w-full items-center gap-2 border-t border-border px-3 py-2.5 text-left text-sm',
        'font-medium transition-colors',
        HIGHLIGHT,
        'disabled:opacity-60',
      )}
    >
      <Plus className="size-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 truncate">{children}</span>
      {hasEnterHint && (
        <CornerDownLeft className="ml-auto size-3.5 shrink-0 opacity-50" aria-hidden="true" />
      )}
    </button>
  );
}

/**
 * A selectable row of a dropdown with a search box.
 *
 * Exported because the concept search uses it too: the same row, with the
 * same highlight and the same check mark, so that picking a concept looks the
 * same in both places. Two copies drift apart.
 */
export function Option({
  isSelected,
  onClick,
  children,
}: {
  isSelected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={isSelected}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors',
        'movil:min-h-[42px]',
        isSelected ? cn('bg-muted font-medium', HIGHLIGHT) : HIGHLIGHT,
      )}
    >
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {isSelected && <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />}
    </button>
  );
}

/** Without accents or capitals: "Educación" is found by typing "educacion". */
function normal(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function ComboOptions({
  filtered,
  value,
  emptyLabel,
  canCreate,
  onSelect,
}: Pick<ComboSearch, 'filtered' | 'canCreate'> & {
  value: string;
  emptyLabel: string;
  onSelect: (value: string) => void;
}) {
  return (
    <ul className="max-h-64 overflow-y-auto p-1">
      <li>
        <Option isSelected={value === ''} onClick={() => onSelect('')}>
          <span className="text-muted-foreground">{emptyLabel}</span>
        </Option>
      </li>

      {filtered.map((o) => (
        <li key={o.value}>
          <Option isSelected={o.value === value} onClick={() => onSelect(o.value)}>
            {o.label}
          </Option>
        </li>
      ))}

      {filtered.length === 0 && !canCreate && (
        <li className="px-2.5 py-2 text-sm text-muted-foreground">
          {t('ui.combo.nothingMatches')}
        </li>
      )}
    </ul>
  );
}

function ComboTriggerContent({
  selected,
  emptyLabel,
  isInField,
  isOpen,
}: {
  selected: ComboOption | undefined;
  emptyLabel: string;
  isInField: boolean;
  isOpen: boolean;
}) {
  return (
    <>
      {/*
        The top padding goes on the TEXT and not on the button: with the button
        padded, the chevron would sit eight pixels low because `items-center`
        would center it in the content box instead of in the field.
      */}
      <span
        data-lleno={selected ? 'si' : 'no'}
        data-vacio={selected ? undefined : ''}
        className={cn(
          'min-w-0 flex-1 truncate text-left',
          !selected && 'text-muted-foreground',
          isInField && 'pt-4',
        )}
      >
        {selected?.label ?? emptyLabel}
      </span>
      <ChevronDown
        className={cn('size-4 shrink-0 opacity-60 transition-transform', isOpen && 'rotate-180')}
        aria-hidden="true"
      />
    </>
  );
}
function DisabledCombo({ id, children }: { id: string | undefined; children: ReactNode }) {
  return (
    <span
      id={id}
      aria-disabled="true"
      className={cn(fieldTrigger(), 'cursor-not-allowed opacity-50')}
    >
      {children}
    </span>
  );
}
