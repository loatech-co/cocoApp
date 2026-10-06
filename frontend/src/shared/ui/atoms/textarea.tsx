import type { ComponentProps } from 'react';

import { cn } from '@/shared/lib/utils';
import { FIELD_FOCUS, useInsideField } from '@/shared/ui/foundations/field';

/**
 * A multi-line field.
 *
 * ── Why it exists ───────────────────────────────────────────────────────────
 * There was only one in the whole app —the notes of a transaction— and it was written
 * by hand: `rounded-lg border bg-card px-3 py-2 text-sm` with the border color
 * set by an inline `style`. It was missing everything else. Without a focus
 * ring, whoever navigates with the tab key never knew where they were; without a
 * placeholder color, its text came out the same tone as what was typed; without a disabled
 * or invalid state, a form that could not be submitted could not point it out.
 *
 * And with none of that in common with the `Input` right above it: two fields
 * side by side, one that lights up when focused and one that does not.
 *
 * ── What it shares with the single-line field ───────────────────────────────
 * Everything but the height: the same border, the same radius, the same 1px ring,
 * the same response to the cursor and the same font size —16px below the
 * breakpoint so that Safari does not zoom the page when focusing it, 14 above—.
 *
 * The height comes from `rows`, which belongs to the element itself, and `min-h-0` does not apply
 * here: a text area that can shrink below its rows stops
 * showing what is being typed.
 */
export function Textarea({ className, placeholder, ...props }: ComponentProps<'textarea'>) {
  // Inside a `Field`, the first line moves down to make room for the
  // label; outside, the padding is symmetric.
  const isInField = useInsideField();

  return (
    <textarea
      // Always a placeholder, even if it is a space: it is what makes
      // `:placeholder-shown` work, and from it comes the state that raises the
      // floating label.
      placeholder={placeholder ?? ' '}
      className={cn(
        'flex w-full rounded-lg border border-input bg-card px-3 py-2 text-base',
        isInField && 'pb-2 pt-6',
        // Inside a field, the placeholder only with focus. See `input.tsx`.
        isInField
          ? 'placeholder:text-transparent focus:placeholder:text-muted-foreground'
          : 'placeholder:text-muted-foreground',
        'transition-colors hover:border-ring/40',
        FIELD_FOCUS,
        'disabled:cursor-not-allowed disabled:opacity-50',
        'aria-invalid:border-destructive aria-invalid:focus-visible:ring-destructive',
        'escritorio:text-sm',
        className,
      )}
      {...props}
    />
  );
}
