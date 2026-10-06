import type { ComponentType, ReactNode } from 'react';

import { cn } from '@/shared/lib/utils';

/**
 * What is shown when there is nothing to show.
 *
 * ── Why leaving it blank or painting zeros is not enough ───────────────────
 * A chart at zero does NOT mean "there is no data": it means "you spent zero",
 * which is a different statement and almost always false. With a filter applied,
 * the flat line makes one believe that month had no movement when what happens
 * is that the cut left them all out.
 *
 * That is why the empty state says TWO things: that there is nothing, and what to do so
 * that there is. A blank gap says neither.
 */
export function EmptyState({
  Icon,
  title,
  description,
  action,
  className,
}: {
  Icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  title: string;
  /** What to do to get out of here. */
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 px-6 py-12 text-center',
        className,
      )}
    >
      <span className="grid size-12 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-6" aria-hidden={true} />
      </span>

      <span>
        <span className="block font-display text-base font-semibold">{title}</span>
        {description && (
          <span className="mx-auto mt-1 block max-w-xs text-sm text-muted-foreground">
            {description}
          </span>
        )}
      </span>

      {action}
    </div>
  );
}
