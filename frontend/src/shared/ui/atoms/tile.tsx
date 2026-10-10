import { Minus } from 'lucide-react';
import type { CSSProperties, PointerEvent, ReactNode } from 'react';

import { t } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { HIGHLIGHT } from '@/shared/ui/foundations/surface';

/**
 * The tiles of the shortcuts grid: an icon and a name in a square.
 *
 * While arranging them, they wiggle and can be dragged; the one in hand is lifted with
 * the floating shadow (lift, not float: see `superficie.test.ts`). Outside
 * that mode they are links, and whoever draws them as a link uses `tileClass`.
 */
export function tileClass(isArranging: boolean, isDragging: boolean): string {
  return cn(
    'relative flex aspect-square flex-col items-center justify-center gap-2 rounded-lg bg-muted p-2 text-center text-foreground transition-colors',
    HIGHLIGHT,
    // The tile under the finger does not wiggle: the animation would override the
    // inline offset and it would stay still under the finger.
    isArranging && !isDragging && 'animate-[tile-wiggle_.4s_ease-in-out_infinite]',
    isDragging && 'z-10 scale-105 shadow-[var(--floating-shadow)]',
  );
}

/** The tile while the grid is being arranged: it is grabbed and dragged. */
export function MovableTile({
  isDragging,
  label,
  style,
  onGrab,
  onMove,
  onRelease,
  children,
}: {
  isDragging: boolean;
  label: string;
  style: CSSProperties | undefined;
  onGrab: (e: PointerEvent<HTMLElement>) => void;
  onMove: (e: PointerEvent<HTMLElement>) => void;
  onRelease: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={cn(tileClass(true, isDragging), 'w-full touch-none')}
      style={style}
      onPointerDown={onGrab}
      onPointerMove={onMove}
      onPointerUp={onRelease}
      onPointerCancel={onRelease}
      aria-label={t('ui.tile.move', { name: label })}
    >
      {children}
    </button>
  );
}

/**
 * The minus.
 *
 * 24, below the 42 touch floor, and it is a GRANTED exception,
 * not a discovered one: it is reached inside a mode entered
 * by long-pressing a tile, and a larger one would be pressed by
 * accident right while dragging, which is the other thing done here.
 */
export function TileRemove({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}): ReactNode {
  return (
    <button
      type="button"
      onClick={onRemove}
      aria-label={t('ui.tile.remove', { name: label })}
      className="absolute -left-1 -top-1 grid size-6 place-items-center rounded-full bg-foreground text-background shadow-[var(--docked-shadow)]"
    >
      <Minus className="size-3.5" strokeWidth={3} aria-hidden="true" />
    </button>
  );
}
