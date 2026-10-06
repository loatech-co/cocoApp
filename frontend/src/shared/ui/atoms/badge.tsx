import { cva, type VariantProps } from 'class-variance-authority';
import { X } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';

import { t } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { REALCE } from '@/shared/ui/foundations/superficie';

/**
 * Tags and chips: two similar things that are NOT the same.
 *
 * ── The difference, and why it matters ──────────────────────────────────────
 * A TAG describes: it says what something is —"Pendiente", "Ingreso"— and it cannot
 * be clicked. A CHIP is a control: it is turned on, turned off or removed.
 *
 * If they are drawn the same, people try to click the tags and do not find
 * the chips; and since the only way to know which is which would be to try, they end up
 * clicking all of them. That is why they are two components and not one with a flag: the
 * chip is a real `<button>`, with its focus and its state, and the tag is
 * a `<span>` that does not pretend to be one.
 *
 * ── The colors come from the meaning ────────────────────────────────────────
 * `income`, `expense`, `pending`, `error`: never "green" or "amber". The day
 * the theme changes, the expense will still be the expense.
 */

const tagVariants = cva(
  cn(
    'inline-flex items-center gap-1 whitespace-nowrap rounded-full border',
    'px-2 py-0.5 text-xs font-medium [&_svg]:size-3',
  ),
  {
    variants: {
      tone: {
        neutral: 'border-transparent bg-muted text-foreground',
        // What is not here yet —«Pronto»—. It is dimmed with the theme's muted
        // ink and never with opacity: `muted-foreground` on `muted` gives
        // 5:1 in both themes, and the same tag at 60 % gave 2.3:1.
        muted: 'border-transparent bg-muted text-muted-foreground',
        outline: 'border-border text-foreground',
        // `income`, not `success`: they are worth the same —in a money app "it
        // was saved" and "money came in" are the same good news— but this
        // tag says INCOME, and the token that names it exists.
        income: 'border-transparent bg-income-surface text-income',
        expense: 'border-transparent bg-expense-surface text-expense',
        pending: 'border-transparent bg-warning-surface text-warning',
        info: 'border-transparent bg-info-surface text-info',
        error: 'border-transparent bg-destructive-surface text-destructive',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

/** A label that describes something. It is not clicked. */
export function Tag({
  className,
  tone,
  ...props
}: ComponentProps<'span'> & VariantProps<typeof tagVariants>) {
  return <span className={cn(tagVariants({ tone }), className)} {...props} />;
}

/**
 * A chip: it is clicked.
 *
 * With `onRemove` it carries its X and behaves like an applied filter; without it, it is
 * an option that turns on and off and says so with `aria-pressed`.
 *
 * The X goes in its own button and not in the chip's: clicking "Costos fijos"
 * to open it and clicking it to remove it cannot be the same gesture, and a
 * single button would force guessing which of the two things is going to happen.
 */
export function Chip({
  isActive = false,
  onRemove,
  removeLabel,
  className,
  children,
  ...props
}: Omit<ComponentProps<'button'>, 'children'> & {
  isActive?: boolean;
  onRemove?: () => void;
  /** Accessible name of the X. Without it, a screen reader says just "button". */
  removeLabel?: string;
  children: ReactNode;
}) {
  const shape = chipShape(isActive);

  if (!onRemove) {
    return (
      <button type="button" aria-pressed={isActive} className={cn(shape, className)} {...props}>
        {children}
      </button>
    );
  }

  return (
    <span className={cn(shape, 'pr-1', className)}>
      {/*
        The name is a button only if it opens something.

        With `onRemove` and without `onClick` —a keyword of a concept, which is
        added and removed and leads nowhere— it was a `<button>` that
        did nothing when clicked: a screen reader announces it as clickable,
        the cursor turns into a hand, and the only gesture that works is the X next to
        it. A name that does nothing is text, and it is written as text.

        Without a focus outline, like every button: the rule in
        `index.css` removes it. Here it was also out of place —this button lives pressed
        against the rounded edge of the chip, so any ring of its own would
        spill out of it—.
      */}
      {props.onClick ? (
        <button type="button" className="min-w-0 truncate rounded-md" {...props}>
          {children}
        </button>
      ) : (
        <span className="min-w-0 truncate">{children}</span>
      )}
      <button
        type="button"
        onClick={onRemove}
        aria-label={removeLabel ?? t('ui.badge.remove')}
        title={removeLabel ?? t('ui.badge.remove')}
        className={cn(
          'flex size-4 shrink-0 items-center justify-center rounded-full transition-colors',
          // When on, the chip is `--primary` and the X carries its ink: the
          // highlight has to be that same ink toned down, not a black.
          // In dark the primary is LIGHT teal, so a black at 20 %
          // made a dark smudge on a light chip.
          isActive ? 'hover:bg-primary-foreground/20' : 'hover:bg-muted-foreground/20',
        )}
      >
        <X className="size-3" aria-hidden="true" />
      </button>
    </span>
  );
}

/**
 * The old name, so as not to break the five screens that already use it.
 *
 * `Badge` with `variant` was shadcn's name, describing the
 * shape instead of the role. They are migrated when touched; meanwhile, this translates.
 */
export function Badge({
  variant,
  className,
  ...props
}: ComponentProps<'span'> & {
  variant?: 'default' | 'outline' | 'income' | 'expense' | 'warning' | 'info';
}) {
  const mapping = {
    default: 'neutral',
    outline: 'outline',
    income: 'income',
    expense: 'expense',
    warning: 'pending',
    info: 'info',
  } as const;

  return <Tag tone={mapping[variant ?? 'default']} className={className} {...props} />;
}

/** The shape of the chip, on or off. */
function chipShape(isActive: boolean): string {
  return cn(
    /*
      ── The corner: 6px, not a pill ─────────────────────────────────────────
      Nobody decided the `rounded-full`: it is the default rounding of a
      chip in any library. But here the chip is not alone —it lives inside
      a 10px block, inside a 10px card— and a pill next to
      two square corners is what the radius rule calls two
      different systems. Smaller than the standard yes, which is what the rule
      allows a chip; with another shape, no.

      ── The height: 32px ────────────────────────────────────────────────────
      It measured 26, which is what came from adding 12 of text and 4 of padding top
      and bottom: a height nobody chose either. 32 is the step of the
      scale just below the 36 of a control, so a chip still
      reads as content and not as a button, but it can now be pressed with
      a finger. The side air goes up with it, from 10 to 12: in a taller box,
      the same narrow padding makes the name look stuck to the edge.
    */
    'inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md border px-3 text-xs',
    // The name of a concept is a proper name: at 12px, the normal weight
    // dissolves against the chip's padding.
    'font-medium transition-colors [&_svg]:size-3.5',
    isActive
      ? 'border-transparent bg-primary text-primary-foreground'
      : /*
          ── The fill: the ink at 10 %, and not a theme surface ────────────────
          It had `bg-card`, and a fixed fill only works if there is a step
          against what is behind it. This chip lives inside a block, which is
          `muted`, and the step went in opposite directions: in light `card` is
          white on a warm canvas and the chip rises; in dark `card`
          is DARKER than the block, so the same chip sinks and reads
          as a hole. Removing the fill entirely did not work either: the edge
          is only ten points above the surface and holds nothing up.

          The ink at 10 % ALWAYS moves toward the text: in light it darkens,
          in dark it lightens. That is, it does exactly what the rule of the
          three surfaces asks for in each theme —inside goes down in light and up in
          dark— without depending on which surface is underneath, which is what
          cannot be known here.

          ── And it responds with the shared highlight ─────────────────────────
          The `hover:bg-muted` it had was a separate bug: inside a `muted`
          block, hovering the chip gave it exactly the color of the box that
          contains it and it disappeared.
        */
        cn('border-border bg-foreground/10 text-foreground', REALCE),
  );
}
