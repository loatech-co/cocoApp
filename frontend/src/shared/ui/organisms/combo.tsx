import { ChevronDown } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { useActiveOption } from '@/shared/lib/active-option';
import { t } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { CreateOption, Option } from '@/shared/ui/atoms/option';
import { SearchBox } from '@/shared/ui/atoms/search-box';
import { fieldTrigger, useInsideField } from '@/shared/ui/foundations/field';
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
      // A dialog and not a listbox: in here there is a text box, the list and
      // the «create» button, and a listbox can only hold options.
      kind="search"
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
          label={label}
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
  label: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  search: ComboSearch;
  value: string;
  emptyLabel: string;
  isCreating: boolean;
  close: () => void;
}

/**
 * Enter picks the row the arrows chose; without one, the only thing left,
 * which is what one expects after typing three letters and seeing a single
 * row; with nothing left, it creates what was typed, if that is offered.
 */
function onEnter(
  activeValue: string | undefined,
  { filtered, canCreate }: ComboSearch,
  pick: (value: string) => void,
  create: () => void,
): void {
  const [only] = filtered;
  if (activeValue !== undefined) pick(activeValue);
  else if (filtered.length === 1 && only !== undefined) pick(only.value);
  else if (canCreate) create();
}

function ComboPanel(props: ComboPanelProps) {
  const { label, inputRef, search, value, emptyLabel, isCreating, close } = props;
  const { query, setQuery, filtered, canCreate } = search;

  // The rows the arrows walk: the empty one first, as it is drawn.
  const nav = useActiveOption(['', ...filtered.map((o) => o.value)], query);

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
        aria-label={label}
        {...nav.boxProps}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (nav.move(e.key) || e.key === 'Enter') e.preventDefault();
          if (e.key === 'Enter') onEnter(nav.activeValue, search, onSelect, onCreate);
        }}
        placeholder={t('ui.combo.search')}
      />

      <ComboOptions
        label={label}
        nav={nav}
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

/** Without accents or capitals: "Educación" is found by typing "educacion". */
function normal(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/**
 * The listbox the search box controls.
 *
 * The options are its DIRECT children: a `ul` with an `li` around each one
 * put a list between the listbox and its options, and a listbox can only
 * own options. «Nada coincide» goes outside for the same reason.
 */
function ComboOptions({
  label,
  nav,
  filtered,
  value,
  emptyLabel,
  canCreate,
  onSelect,
}: Pick<ComboSearch, 'filtered' | 'canCreate'> & {
  label: string;
  nav: ReturnType<typeof useActiveOption>;
  value: string;
  emptyLabel: string;
  onSelect: (value: string) => void;
}) {
  const rows = [{ value: '', label: emptyLabel }, ...filtered];
  return (
    <div className="max-h-64 overflow-y-auto p-1">
      <div role="listbox" id={nav.listId} aria-label={label}>
        {rows.map((o, i) => (
          <Option
            key={o.value}
            id={nav.optionId(i)}
            isSelected={o.value === value}
            isActive={nav.activeId === nav.optionId(i)}
            onClick={() => onSelect(o.value)}
          >
            {i === 0 ? <span className="text-muted-foreground">{o.label}</span> : o.label}
          </Option>
        ))}
      </div>

      {filtered.length === 0 && !canCreate && (
        <p className="px-2.5 py-2 text-sm text-muted-foreground">{t('ui.combo.nothingMatches')}</p>
      )}
    </div>
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
        data-filled={selected ? 'yes' : 'no'}
        data-empty={selected ? undefined : ''}
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
