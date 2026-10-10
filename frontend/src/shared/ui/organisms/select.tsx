import { ChevronDown } from 'lucide-react';
import type { ComponentType, KeyboardEvent, ReactNode } from 'react';

import { useActiveOption } from '@/shared/lib/active-option';
import { cn } from '@/shared/lib/utils';
import { Option } from '@/shared/ui/atoms/option';
import { fieldTrigger, useInsideField } from '@/shared/ui/foundations/field';
import { Menu } from '@/shared/ui/molecules/menu';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  /** The selected value. `''` is "none". */
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  /** Accessible name of the field. */
  label: string;
  /** Text of the option with no value. If omitted, choosing is required. */
  emptyLabel?: string;
  /** The same two as the whole app: `sm` measures 36 and `md` measures 44. */
  size?: 'sm' | 'md';
  disabled?: boolean | undefined;
  /** On the left, informative: what this field is for. */
  icon?: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  /** On the right, active. One or two, before the chevron. */
  actions?: ReactNode[];
  /** The `id` of the BUTTON, so that a label can point at it. */
  id?: string;
  className?: string;
}

/**
 * A dropdown list, drawn by the app.
 *
 * ── Why it is not a `<select>` ──────────────────────────────────────────────
 * Because its list is painted by the OPERATING SYSTEM: its typeface, its
 * colors, its language and its chevron stuck to the right edge. The same
 * screen looks different on every machine, and in the middle of a green form
 * a gray Windows box appears.
 *
 * It is built on `Menu`, which is what knows how to open, close on a tap
 * outside and close with Escape. If that mechanism gets fixed, it gets fixed
 * here and in the filter and in the account menu at once.
 *
 * ── What is lost and why it is accepted ─────────────────────────────────────
 * The native one on a phone opens the iOS wheel or the Android dialog, which
 * are well made. That is given up in exchange for the app looking the same
 * everywhere; in return, this list scrolls, marks the selection and closes on
 * choosing, which is what gets used 99 % of the time.
 *
 * ── The icons, the same as in a text field ──────────────────────────────────
 * `icon` on the left is informative; `actions` on the right are active and go
 * BEFORE the chevron, which is the dropdown's own action and always the last.
 * Here there is no need to reserve room for them with padding as in an
 * `<input>`: a button can have children, so they go in the same row and the
 * text shrinks by itself.
 *
 * ── What `data-lleno` is and what `data-vacio` is ───────────────────────────
 * Both are read by the floating label of `.campo`, in `index.css`: the first
 * to rise when something is selected, the second to hide the «not chosen»
 * text while the label is taking its place.
 */
export function Select(props: SelectProps) {
  const { value, onChange, options, label, emptyLabel, id, className } = props;
  const isSmall = props.size === 'sm';
  const isInert = props.disabled === true || (options.length === 0 && emptyLabel === undefined);
  const isInField = useInsideField();
  const triggerContent = <SelectTriggerContent select={props} isInField={isInField} />;
  // The rows the arrows walk, in the order they are drawn.
  const values = [...(emptyLabel === undefined ? [] : ['']), ...options.map((o) => o.value)];
  const nav = useActiveOption(values);

  // Disabled cannot be a button that opens anything: it is painted the same
  // but with no dropdown behind it, so that focus does not fall into a trap.
  if (isInert) return <DisabledTrigger select={props}>{triggerContent}</DisabledTrigger>;

  return (
    <Menu
      label={label}
      kind="list"
      align="left"
      // Selects live in forms, and a long form scrolls: without this, the
      // panel is clipped by the box that contains it.
      isFloating
      width="field"
      triggerId={id}
      boxClassName={cn('w-full min-w-0', className)}
      triggerClassName={fieldTrigger(isSmall)}
      trigger={() => triggerContent}
      // Opening points at the chosen option.
      onOpen={() => nav.point(values.indexOf(value))}
      triggerProps={({ isOpen, close }) =>
        comboboxTrigger({ nav, isOpen, label: isInField ? undefined : label }, (v) => {
          onChange(v);
          close();
        })
      }
    >
      {(close) => (
        <SelectOptions
          label={label}
          nav={nav}
          value={value}
          options={options}
          emptyLabel={emptyLabel}
          onChange={onChange}
          close={close}
        />
      )}
    </Menu>
  );
}

/**
 * What the trigger says as a select-only combobox: it keeps the focus while
 * the list is open, says which option is active and handles the arrows.
 *
 * `label` only loose: a combobox takes no name from its content, and inside a
 * field the `<label>` already names it.
 */
function comboboxTrigger(
  { nav, isOpen, label }: { nav: ActiveOption; isOpen: boolean; label: string | undefined },
  pick: (value: string) => void,
) {
  return {
    ...nav.boxProps,
    'aria-label': label,
    'aria-expanded': isOpen,
    'aria-controls': isOpen ? nav.listId : undefined,
    'aria-activedescendant': isOpen ? nav.activeId : undefined,
    'aria-autocomplete': undefined,
    onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => {
      onTriggerKey(e, isOpen, nav, pick);
    },
  };
}

type ActiveOption = ReturnType<typeof useActiveOption>;

/**
 * The keys of the trigger. Closed, an arrow opens the list; open, the arrows
 * move the active option and Enter or Space picks it. Without an active
 * option, Enter does what a button does: close.
 */
function onTriggerKey(
  e: KeyboardEvent<HTMLButtonElement>,
  isOpen: boolean,
  nav: ReturnType<typeof useActiveOption>,
  pick: (value: string) => void,
): void {
  const isArrow = e.key === 'ArrowDown' || e.key === 'ArrowUp';
  if (!isOpen) {
    if (isArrow) {
      e.preventDefault();
      e.currentTarget.click();
    }
    return;
  }
  if (nav.move(e.key)) e.preventDefault();
  else if ((e.key === 'Enter' || e.key === ' ') && nav.activeValue !== undefined) {
    e.preventDefault();
    pick(nav.activeValue);
  }
}

/**
 * The listbox the trigger controls, with its options as DIRECT children —the
 * same structure as `Combo`—. A `ul` with an `li` around each option put a
 * list between the listbox and its options.
 */
function SelectOptions({
  label,
  nav,
  value,
  options,
  emptyLabel,
  onChange,
  close,
}: Pick<SelectProps, 'label' | 'value' | 'options' | 'onChange'> & {
  nav: ActiveOption;
  emptyLabel: string | undefined;
  close: () => void;
}) {
  const rows = [
    ...(emptyLabel === undefined ? [] : [{ value: '', label: emptyLabel }]),
    ...options,
  ];
  return (
    <div className="max-h-64 overflow-y-auto">
      <div role="listbox" id={nav.listId} aria-label={label}>
        {rows.map((o, i) => (
          <Option
            key={o.value}
            id={nav.optionId(i)}
            isSelected={o.value === value}
            isActive={nav.activeId === nav.optionId(i)}
            onClick={() => {
              onChange(o.value);
              close();
            }}
          >
            {i === 0 && emptyLabel !== undefined ? (
              <span className="text-muted-foreground">{o.label}</span>
            ) : (
              o.label
            )}
          </Option>
        ))}
      </div>
    </div>
  );
}

/** What shows inside the field: the icon, the selection, the actions and the chevron. */
function SelectTriggerContent({ select, isInField }: { select: SelectProps; isInField: boolean }) {
  const { icon: Icon, emptyLabel } = select;
  const isSmall = select.size === 'sm';
  const selected = select.options.find((o) => o.value === select.value);
  const trailing = select.actions?.filter(Boolean) ?? [];
  return (
    <>
      {Icon && (
        <span data-icono="" className="shrink-0 text-muted-foreground">
          <Icon className={isSmall ? 'size-3.5' : 'size-4'} aria-hidden={true} />
        </span>
      )}

      {/*
        The top padding goes on the TEXT and not on the button, and that is
        why the chevron does not move: with the button padded, `items-center`
        would center the chevron in the content box instead of in the field
        and it would sit eight pixels low. Stretching only the text, the line
        grows upward and the chevron stays in the center of the field, which
        is where it is looked for.
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
        {selected?.label ?? emptyLabel ?? '—'}
      </span>

      {trailing.map((action, i) => (
        // The index as key: they are one or two fixed buttons the field
        // declares when it is built, not a list that gets reordered.
        // eslint-disable-next-line @eslint-react/no-array-index-key -- fixed, positional list with no id of its own
        <span key={i} className="shrink-0">
          {action}
        </span>
      ))}

      <ChevronDown
        className={cn('shrink-0 opacity-60', isSmall ? 'size-3.5' : 'size-4')}
        aria-hidden="true"
      />
    </>
  );
}
function DisabledTrigger({ select, children }: { select: SelectProps; children: ReactNode }) {
  return (
    <span
      id={select.id}
      className={cn(
        fieldTrigger(select.size === 'sm'),
        'cursor-not-allowed opacity-50',
        select.className,
      )}
      aria-disabled="true"
    >
      {children}
    </span>
  );
}
