import { Check, ChevronDown } from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';

import { cn } from '@/shared/lib/utils';
import { fieldTrigger, useInsideField } from '@/shared/ui/foundations/field';
import { HIGHLIGHT } from '@/shared/ui/foundations/surface';
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
  const {
    value,
    onChange,
    options,
    label,
    emptyLabel,
    size = 'md',
    disabled: isDisabled = false,
    id,
    className,
  } = props;
  const isSmall = size === 'sm';
  const isInert = isDisabled || (options.length === 0 && emptyLabel === undefined);
  const isInField = useInsideField();
  const triggerContent = <SelectTriggerContent select={props} isInField={isInField} />;

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
    >
      {(close) => (
        <SelectOptions
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

function Option({
  isSelected,
  onClick,
  children,
}: {
  isSelected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <li>
      <button
        type="button"
        role="option"
        aria-selected={isSelected}
        onClick={onClick}
        className={cn(
          'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors',
          'movil:min-h-[42px]',
          // Still on `muted`, pointed at on `accent`: with the same color for
          // both, hovering over the already-selected option changes nothing.
          isSelected ? cn('bg-muted font-medium', HIGHLIGHT) : HIGHLIGHT,
        )}
      >
        <span className="min-w-0 flex-1 truncate">{children}</span>
        {isSelected && <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />}
      </button>
    </li>
  );
}

function SelectOptions({
  value,
  options,
  emptyLabel,
  onChange,
  close,
}: Pick<SelectProps, 'value' | 'options' | 'onChange'> & {
  emptyLabel: string | undefined;
  close: () => void;
}) {
  const canBeEmpty = emptyLabel !== undefined;
  return (
    <ul className="max-h-64 overflow-y-auto">
      {canBeEmpty && (
        <Option
          isSelected={value === ''}
          onClick={() => {
            onChange('');
            close();
          }}
        >
          <span className="text-muted-foreground">{emptyLabel}</span>
        </Option>
      )}

      {options.map((o) => (
        <Option
          key={o.value}
          isSelected={o.value === value}
          onClick={() => {
            onChange(o.value);
            close();
          }}
        >
          {o.label}
        </Option>
      ))}
    </ul>
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
