import type { ComponentProps } from 'react';

import { cn } from '@/shared/lib/utils';
import { HIGHLIGHT } from '@/shared/ui/foundations/surface';

/**
 * A row of a list INSIDE a card, which can be clicked: a pending
 * payment. In a column, so that whatever goes below —a progress bar— stacks.
 *
 * The highlight is a BACKGROUND, not a drop in opacity: dimming the text on
 * hover is what a disabled control does, and the row that can be
 * clicked looked like the one that cannot. And it does not leave the card: it takes the width
 * of the column, aligned with the title, with 12px of air on each side.
 *
 * The highlight is the accent as INK (`REALCE`), not the accent surface:
 * on a card that is already faint, `accent` barely told the highlighted row
 * apart from its neighbors.
 *
 * Without `onClick` the row stays still: no highlight and no hand cursor.
 */
export function CardRow({
  onClick,
  ...props
}: Omit<ComponentProps<'button'>, 'className' | 'type' | 'disabled'>) {
  return (
    <button
      type="button"
      disabled={!onClick}
      onClick={onClick}
      className={cn(
        'flex w-full flex-col gap-2 rounded-md px-3 py-2.5 text-left transition-colors',
        onClick ? cn('cursor-pointer', HIGHLIGHT) : 'cursor-default',
      )}
      {...props}
    />
  );
}
