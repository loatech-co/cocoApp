import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';

import { cn } from '@/shared/lib/utils';

/**
 * The button. ALL the buttons.
 *
 * ── Why the height and the radius live in `size` and not in the base ────────
 * Because they are what has to change together. When the radius was in the base,
 * any button that needed less rounded corners overrode it with a
 * `className`, and a different height sneaked in with it: that is how four
 * heights ended up living side by side in the same bar. Now picking a size picks
 * both things, and there is nothing to override.
 *
 * If a new measurement is needed, a `size` is added here. A `className` with
 * `h-` or `rounded-` in a stray call is the sign that a size is missing.
 *
 * The font WEIGHT also belongs to the base, for the same reason: a variant lowered it
 * to `font-medium` and its button looked smaller than the one next to it even though
 * both measured exactly the same.
 *
 * ── The touch floor, and why it is in the BASE ──────────────────────────────
 * Below the breakpoint, 42px high and wide at least. The sizes are
 * drawn for a pointer: `sm` measures 36 and `default` 40. Apple says 44 and
 * Material says 48, so 42 is the MINIMUM, not the goal.
 *
 * `min-height`, not `height`: a control that is already taller stays as it is,
 * and that is why it can live in the base without fighting any size.
 *
 * In the base and not in each call because an exception has to be GRANTED,
 * not discovered: from outside it cannot be lowered —the call-site test
 * rejects any `min-h-0` just as it rejects an `h-9`—, so the only
 * way to have a smaller button is to add a size here that says so.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 outline-none movil:min-h-[42px] movil:min-w-[42px]",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        /** The theme's accent: a faint surface with its own ink. */
        accent: 'bg-accent text-accent-foreground hover:brightness-95',
        /**
         * The THEME's `secondary`, which here is the gold.
         *
         * It is not "a gray button": that is what `ghost` and `outline` are for. This one
         * exists for the secondary action that does want to stand out, and it carries the
         * ink the theme declares for it —never white out of habit—.
         */
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/90',
        outline: 'border border-input bg-background hover:bg-muted hover:text-foreground',
        ghost: 'hover:bg-muted hover:text-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
        /** Red. Reserved for destructive actions — nothing else. */
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        /**
         * The controls of a toolbar: on the page background,
         * with the same weight as a text field and not that of a
         * primary action. They are turned on with `aria-pressed`.
         */
        /*
          On carries the ACCENT, just like the section one is in
          inside the rail: a flat wash of the color at 15 % and the text in the
          color. It used to turn on with `accent`, which is the surface of what
          responds to the cursor: on and hovered were painted almost
          the same, and in a toolbar —where what is on has
          neither a check mark nor text that says so— the strongest color has to go
          to what is on. It is the exception rule 8 already allowed for.
        */
        tool: 'border border-border bg-card text-foreground hover:bg-muted aria-pressed:border-primary/40 aria-pressed:bg-primary/15 aria-pressed:text-primary',
        /**
         * A button that acts as a FIELD: the date picker, which inside is
         * a button because it opens a calendar, but in a form row
         * is one more field and has to read as such.
         *
         * It differs from `tool` in two things, and both matter:
         * it carries the field border —`--input`, not `--border`— and on hover
         * it TINTS THE BORDER instead of filling. A field that
         * fills on mouse hover reads as a button, and in a row where
         * the one next to it is a `Select` that only tints, one of the two
         * flickers and the other does not.
         *
         * The weight also drops: what is read there is a value, not an action.
         */
        /*
         * The horizontal padding can NOT be set here, and it needs saying
         * because it was tried: `cva` emits the classes in the order of its
         * configuration —base, variant, size—, so the size's `px-5`
         * comes AFTER and wins. A `px-3` written in this variant
         * does nothing, and the date picker ended up with its value eight pixels
         * further in than the label that names it.
         *
         * Its call site sets it, which is the last thing `cn` sees. The call-site
         * test allows it on purpose: it forbids the height, the VERTICAL
         * padding and the radius —which belong to the size— and not the horizontal one.
         */
        field:
          'border border-input bg-card font-normal text-foreground transition-colors hover:border-ring/40 aria-expanded:border-ring',
      },
      /*
        ── TWO sizes, and the same ones for everything ──────────────────────────────
        `sm` measures 36 and `md` measures 44, and those two heights apply to a button,
        a text field, a dropdown and a date picker. A row of
        controls where the button measures 40, the field 42 and the picker 36 looks
        shaky even though nobody can say why.

        There were eight —default, sm, lg, icon, icon-sm, chip, chip-icon, campo— and
        each with its own height and radius. Eight measurements is having none: people
        picked whichever looked like the one next to it, and that is how they drifted apart.

        The icon variants are the same heights as squares. They are not one
        more size: they are the same one, without text.

        44 is also the minimum touch target accessibility asks for, so
        the form size already meets it with no exceptions for mobile.
      */
      size: {
        sm: 'h-9 rounded-lg px-3',
        md: 'h-11 rounded-lg px-5',
        'sm-icon': 'size-9 rounded-lg',
        'md-icon': 'size-11 rounded-lg',
        /*
          The same icon button, with a round edge.

          It is an EXCEPTION to the standard radius and it is here and not in a call
          because the radius belongs to the size: written outside, the next one who
          needs it will write it differently.
        
          It exists for the controls that live over a document —the zoom, the
          full-screen toggle, the delete— and that go inside a round pill. A
          square highlight inside a pill leaves two corners poking out
          at each end, and that shows more than the button itself.
        */
        'sm-icon-round': 'size-9 rounded-full',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  },
);

export type ButtonProps = ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  };

export function Button({
  className,
  variant,
  size,
  asChild: isSlot = false,
  ...props
}: ButtonProps) {
  const Comp = isSlot ? Slot : 'button';
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export { buttonVariants };
