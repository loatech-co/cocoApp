import type { ComponentProps } from 'react';

import { cn } from '@/shared/lib/utils';
import { HIGHLIGHT } from '@/shared/ui/foundations/surface';

/**
 * An option of a short list that is TURNED ON: the range shortcuts («Este
 * mes», «Últimos 90 días»…) next to the calendar.
 *
 * It carries no check mark or other mark, so what is on is painted with the
 * accent and the hover with the highlight: the exception of rule 8, the
 * same as the `tool` button. It is announced with `aria-pressed`.
 *
 * ── On the phone it is a chip ───────────────────────────────────────────────
 * There the options sit in a grid of equal cells, not in a column, so each
 * one is a box —a border, the name centered— and 42 high, the touch floor:
 * a row of names without edges read as loose words, and the selected one as
 * a stain. Every chip in the grid is the same height because the box is.
 */
export function ToggleOption({
  isOn,
  type = 'button',
  ...props
}: Omit<ComponentProps<'button'>, 'className' | 'aria-pressed'> & { isOn: boolean }) {
  return (
    <button
      type={type}
      aria-pressed={isOn}
      className={cn(
        'w-full rounded-md px-3 py-1.5 text-left text-sm transition-colors',
        'mobile:min-h-[42px] mobile:border mobile:px-1.5 mobile:text-center mobile:leading-tight',
        isOn
          ? 'bg-primary/15 font-medium text-primary mobile:border-primary/40'
          : cn('text-muted-foreground mobile:border-border', HIGHLIGHT),
      )}
      {...props}
    />
  );
}
