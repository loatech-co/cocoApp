import { Loader2 } from 'lucide-react';
import type { ComponentProps } from 'react';

import { cn } from '@/shared/lib/utils';

/**
 * An on/off switch.
 *
 * ── When this and when a checkbox ───────────────────────────────────────────
 * The checkbox is for CHOOSING from a list: ticking three cost centers out of
 * ten. The switch is for TURNING ON something that changes what is shown —here,
 * a whole section of fields that appears below—. They are two different gestures and
 * they read differently: one answers "which ones?", the other "yes or no?".
 *
 * The `<input>` is still underneath, invisible: the keyboard, the focus and screen
 * readers work just like with any checkbox.
 *
 * `isLoading` is for the one that saves on change (the Mi cuenta settings): the
 * knob spins while the server responds and the switch cannot be
 * pressed again. Settings drew its own, four pixels wider and with
 * a different knob in dark; two copies that had already drifted apart.
 */
export function Switch({
  className,
  isLoading = false,
  disabled: isDisabled,
  ...props
}: ComponentProps<'input'> & { isLoading?: boolean }) {
  return (
    <span className="relative inline-flex shrink-0">
      <input
        type="checkbox"
        role="switch"
        className="peer absolute inset-0 z-10 cursor-pointer opacity-0"
        disabled={isDisabled ?? isLoading}
        {...props}
      />
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none flex h-6 w-10 items-center rounded-full p-0.5 transition-colors',
          'bg-input peer-checked:bg-primary peer-checked:[&>span]:translate-x-4',
          'peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background',
          'peer-disabled:opacity-40',
          // ── The knob has to be the LIGHT thing on the dark ─────────────
          // It was always `bg-card`. In light it works —white on gray—, but
          // in dark `--card` is almost black on a greenish gray track: the
          // knob ended up darker than its track and read as a hole
          // instead of as something that slides.
          //
          // Off in dark it switches to the page ink, which is light;
          // on, to the primary's ink, which on the light teal of the
          // track is the dark one again. Both are tokens: in any
          // theme the knob stands apart from its track without having to choose.
          'dark:[&>span]:bg-foreground dark:peer-checked:[&>span]:bg-primary-foreground',
          className,
        )}
      >
        <span className="grid size-5 place-items-center rounded-full bg-card shadow-sm transition-transform">
          {isLoading && <Loader2 className="size-3 animate-spin" aria-hidden="true" />}
        </span>
      </span>
    </span>
  );
}
