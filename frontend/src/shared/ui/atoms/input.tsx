import type { ComponentProps, ComponentType, ReactNode } from 'react';

import { cn } from '@/shared/lib/utils';
import { FIELD_FOCUS, LABEL_GAP, useInsideField } from '@/shared/ui/foundations/field';

/**
 * A text field.
 *
 * ── The same TWO sizes as the button ────────────────────────────────────────
 * `sm` measures 36 and `md` measures 44, and they are the same two as `button.tsx`,
 * the `Select`, the `Combo` and the date picker. A row where the button measures
 * 44, the field 40 and the dropdown 36 looks shaky even though nobody can
 * point out why.
 *
 * ── The icons: one on the left, up to two on the right ──────────────────────
 * They do not play the same role and that is why they are two props and not one list:
 *
 * · `icon` is INFORMATIVE. It says what the field is for —a person, a magnifier, a
 *   calendar— and it cannot be clicked. It goes on the left, which is where reading
 *   starts.
 * · `actions` are ACTIVE. They do something: clear what was typed, open a
 *   list, show the password. They go on the right, where the thumb is on a
 *   phone and where they do not get in the way of the text being typed.
 *
 * It is a LIST and not a loose `ReactNode` on purpose: the field needs to know
 * HOW MANY there are to reserve room for them with its right padding, and counting the
 * children of a fragment cannot be done reliably. Two is the cap
 * —clear and search, clear and open—; with three, half the field is
 * buttons.
 *
 * ── Why the icons are absolutely positioned and not in a row ────────────────
 * Because an `<input>` cannot have children: it is a void element. A
 * dropdown can, and that is why there the icons go in the row and nothing
 * needs reserving.
 */
export function Input({
  className,
  type,
  size = 'md',
  icon: Icon,
  actions,
  placeholder,
  ...props
}: Omit<ComponentProps<'input'>, 'size'> & {
  size?: 'sm' | 'md';
  /** On the left, informative: what this field is for. */
  icon?: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  /** On the right, active. One or two. */
  actions?: ReactNode[];
}) {
  const right = actions?.filter(Boolean) ?? [];
  // Inside a `Field`, the value moves down to make room for the label.
  const isInField = useInsideField();

  const field = (
    <input
      type={type}
      /*
        There is always a placeholder, even if it is a space.

        It is what makes `:placeholder-shown` work, and from it comes the
        "this field has something typed" state that raises the floating label.
        Without the attribute, the selector never matches and the label stays
        up from the start, covering an empty field.
      */
      placeholder={placeholder ?? ' '}
      className={cn(inputClass(size, isInField, Boolean(Icon), right.length), className)}
      {...props}
    />
  );

  if (!Icon && right.length === 0) return field;

  return (
    <span className="relative block">
      {field}

      {Icon && (
        <span
          // `data-icon` is what tells the floating label it has to
          // start further to the right. `.field` reads it in `index.css`.
          data-icon=""
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        >
          <Icon className="size-4" aria-hidden={true} />
        </span>
      )}

      {right.length > 0 && (
        <span className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
          {right.map((action, i) => (
            // The index as key: this list is never reordered or filtered,
            // they are one or two fixed buttons the field declares when it is built.
            // eslint-disable-next-line @eslint-react/no-array-index-key -- fixed, positional list with no id of its own
            <span key={i}>{action}</span>
          ))}
        </span>
      )}
    </span>
  );
}

/** The classes of the `<input>`: its size, its focus and the room for its icons. */
function inputClass(
  size: 'sm' | 'md',
  isInField: boolean,
  hasIcon: boolean,
  actions: number,
): string {
  return cn(
    'flex w-full rounded-lg border border-input bg-card px-3',
    size === 'sm' ? 'h-9 text-sm' : 'h-11 text-base',
    // The touch floor, even if in `md` it is redundant: 44 is already over 42. It is declared
    // anyway because `piso-tactil.test.ts` asks whoever draws a control
    // to say so, and the day someone lowers this height the floor is still in place.
    'mobile:min-h-[42px]',
    /*
      Inside a field, the placeholder is ONLY shown with focus: at rest its
      place is taken by the label, and both at once are two gray texts
      stepping on each other —which is exactly what was happening—.

      It goes here and not in the stylesheet because a utility beats the
      `components` layer, and this class is exactly the one that was winning.
    */
    isInField
      ? 'placeholder:text-transparent focus:placeholder:text-muted-foreground'
      : 'placeholder:text-muted-foreground',
    // On hover the BORDER is tinted, just like the `Select` and the
    // `Combo` next to it. Without this, in the same row one control
    // responded to the mouse and the one next to it did not, and it looked like one was
    // disabled.
    'transition-colors hover:border-ring/40',
    // The why of the thickness and of `:focus-visible`, in `field.tsx`.
    FIELD_FOCUS,
    'disabled:cursor-not-allowed disabled:opacity-50',
    'aria-invalid:border-destructive aria-invalid:focus-visible:ring-destructive',
    // 16px below the breakpoint and 14 above it, and the breakpoint is the app's
    // —not Tailwind's `md:`, which only measures the width—: a tablet
    // in portrait is touch even if it measures 800, and Safari zooms the whole
    // page when focusing a field under 16px.
    size === 'md' && 'desktop:text-sm',
    // Room for the icons. On the left: 12 of margin, 16 of icon and 8
    // of air. On the right, the same for each 28 button.
    hasIcon && 'pl-9',
    actions === 1 && 'pr-11',
    actions >= 2 && 'pr-19',
    isInField && LABEL_GAP,
  );
}

/**
 * One of a field's `actions`: a 28 icon that is clicked, inside
 * the box and on the right. What the action does is said by `label`, which is its
 * accessible name and its hint.
 */
export function FieldAction({
  Icon,
  label,
  hint,
  ...props
}: Omit<ComponentProps<'button'>, 'className' | 'children' | 'type'> & {
  Icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  label: string;
  /** The hover hint, if it is shorter than `label`. */
  hint?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={hint ?? label}
      className={cn(
        'flex size-7 items-center justify-center rounded-md text-muted-foreground',
        'transition-colors hover:bg-muted hover:text-foreground',
        'disabled:pointer-events-none disabled:opacity-40',
      )}
      {...props}
    >
      <Icon className="size-4" aria-hidden={true} />
    </button>
  );
}
