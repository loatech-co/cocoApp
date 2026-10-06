import { Check, Minus } from 'lucide-react';
import type { ComponentProps } from 'react';

import { cn } from '@/shared/lib/utils';

/**
 * A checkbox.
 *
 * ── Why it is not a bare `<input type="checkbox">` ──────────────────────────
 * Because the native one is painted with the operating system's colors and not with
 * the product's: in dark mode a white Windows box shows up in the middle of
 * a green menu. The input is still there —invisible but present— so that the
 * keyboard, the focus and screen readers work as always; what
 * is seen is the box next to it.
 *
 * `isIndeterminate` is for a parent with only some children checked: saying "yes"
 * when half are missing is lying, and saying "no" too.
 */
export function Checkbox({
  className,
  isIndeterminate = false,
  ...props
}: ComponentProps<'input'> & { isIndeterminate?: boolean }) {
  return (
    <span className="relative inline-grid size-4 shrink-0 place-items-center">
      <input
        type="checkbox"
        className="peer absolute inset-0 cursor-pointer opacity-0"
        {...props}
      />
      <span
        aria-hidden="true"
        className={cn(
          // `rounded-sm` is `--radius` minus 4, that is 6px: it comes from the theme's
          // scale. It was a hand-written `rounded-[5px]`, from when the scale
          // was shifted and no name gave a low value.
          'pointer-events-none grid size-4 place-items-center rounded-sm border transition-colors',
          'border-input bg-card text-primary-foreground',
          // The border is tinted on hover, just like a field: the
          // checkbox is the smallest control in the app and without this there is no
          // way of knowing it can be clicked until it is clicked.
          'peer-hover:border-ring/50',
          'peer-checked:border-primary peer-checked:bg-primary peer-checked:[&>svg]:opacity-100',
          'peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-1 peer-focus-visible:ring-offset-background',
          'peer-disabled:opacity-40',
          isIndeterminate && 'border-primary bg-primary',
          className,
        )}
      >
        {isIndeterminate ? (
          <Minus className="size-3" strokeWidth={3} />
        ) : (
          <Check className="size-3 opacity-0 transition-opacity" strokeWidth={3} />
        )}
      </span>
    </span>
  );
}
