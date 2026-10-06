import type { ReactNode } from 'react';

import { cn } from '@/shared/lib/utils';
import { SURFACE_HIGHLIGHT } from '@/shared/ui/foundations/surface';

/**
 * The dashed box where files are dropped or clicked to pick them.
 *
 * ── A BOX, not a button ─────────────────────────────────────────────────────
 * A button inside another is not valid HTML, and other controls fit inside the box
 * (the one for pasting a screenshot). So the box is a box, and what
 * responds to the click is a button WITHOUT content that covers it whole and goes first:
 * what reads on top does not intercept the mouse, and the click lands wherever it lands. Whatever
 * has to be clicked separately carries `relative` to stay on top.
 *
 * | Shape    | Where                                                  |
 * | -------- | ------------------------------------------------------ |
 * | `square` | Next to the thumbnails: one more tile, 104 wide        |
 * | `full`   | With nothing beside it: takes the width and height given |
 *
 * `isOver` while something is dragged over it; `isBusy` while uploading.
 */
export function DropSurface({
  shape,
  isOver,
  isBusy,
  label,
  onPick,
  children,
}: {
  shape: 'square' | 'full';
  isOver: boolean;
  isBusy: boolean;
  /** The accessible name of the button that covers it: «Agregar soportes». */
  label: string;
  onPick: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        'relative flex flex-col items-center justify-center gap-1.5 rounded-lg',
        'border-2 border-dashed transition-colors',
        shape === 'full' ? 'min-h-36 flex-1 px-4 py-8' : 'size-[104px]',
        isBusy
          ? 'cursor-wait border-border text-muted-foreground'
          : isOver
            ? 'border-acento-tinta bg-accent text-accent-foreground'
            : cn('border-border text-muted-foreground', SURFACE_HIGHLIGHT),
      )}
    >
      {/* No ring of its own: `index.css` resolves the focus of a button for
          all of them at once (rule 18). */}
      <button
        type="button"
        onClick={onPick}
        disabled={isBusy}
        aria-label={label}
        className="absolute inset-0 rounded-lg"
      />
      {children}
    </div>
  );
}
