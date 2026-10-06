import { useId, useRef, useState, type ReactNode } from 'react';

import { cn } from '@/shared/lib/utils';

/**
 * An explanation on hover.
 *
 * ── Why not the browser's `title` ───────────────────────────────────────────
 * Because it takes about a second to appear —plenty of time for one
 * to give up—, it is drawn with the operating system's colors and on a touch
 * screen it does not exist. A color you have to guess does not inform, it puzzles; and an
 * explanation that does not appear is the same as not having it.
 *
 * ── Why `fixed` and not `absolute` ──────────────────────────────────────────
 * Because these explanations live inside tables, and a table scrolls
 * sideways: it is a clipping box. A bubble placed inside it would
 * be cut against its edge. With `fixed` it leaves the box and is placed against the
 * window, which is what one expects of something that floats.
 *
 * ── Why the hint is ALWAYS in the tree ──────────────────────────────────────
 * The anchor names it with `aria-describedby`, and a screen reader reads it on
 * reaching the anchor. If the hint only existed while visible, when focusing the
 * anchor it would not be there yet —it appears in response to focus— and it was never
 * announced. Hidden with `hidden` it still serves as a description: the
 * accessible description reads what is referenced even if it is not visible.
 */
export function WithTooltip({
  text,
  children,
  className,
}: {
  text: string;
  children: ReactNode;
  className?: string;
}) {
  const anchor = useRef<HTMLSpanElement>(null);
  const id = useId();
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);

  function show(): void {
    const box = anchor.current?.getBoundingClientRect();
    if (!box) return;
    setPosition({ x: box.left + box.width / 2, y: box.top });
  }

  return (
    <span
      ref={anchor}
      className={cn('relative inline-flex', className)}
      onPointerEnter={show}
      onPointerLeave={() => setPosition(null)}
      onFocus={show}
      onBlur={() => setPosition(null)}
      tabIndex={0}
      aria-describedby={id}
    >
      {children}

      <span
        id={id}
        role="tooltip"
        hidden={!position}
        style={position ? { left: `${position.x}px`, top: `${position.y - 8}px` } : undefined}
        className={cn(
          'pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full',
          // `whitespace-normal` is mandatory: these explanations live
          // in table cells, which carry `whitespace-nowrap` so that
          // dates do not break. That is inherited, so without this the bubble
          // grew on a single line until it went off the screen.
          // Without `text-balance`: it split the text into even lines and
          // to achieve it broke before the line was full, so
          // a break appeared where there was still room. The text flows.
          'max-w-[200px] whitespace-normal break-words',
          // ── Inverted, and that is why it does NOT use the shared surface ──
          // A tooltip is not one more surface of the app: it is a note in the
          // margin, and it reads as such when it contrasts with everything else. If
          // it were the color of the dropdowns, in dark it would be lighter
          // than the card and the bubble would seem to float upward.
          //
          // `foreground` on `background` with the roles swapped: the
          // page's ink acts as background and the background acts as ink. That way it
          // inverts on its own with the theme —dark in light, light in dark— without
          // having to declare two colors or remember to keep them in sync.
          // They used to be `tinta-950` and `tinta-50`, two hex values from the
          // previous palette that the theme change did not touch.
          //
          // The edge is the same theme border as the rest of what floats;
          // it was a white at 10 % that painted nothing in light.
          //
          // 6px is `rounded-sm`: `--radius` minus 4. The previous comment
          // said the scale was shifted and that no name gave a
          // low value —true when `--radius` was 1rem, false since it
          // is 0.625rem—, so the hand-written value is no longer needed.
          'rounded-sm bg-foreground px-2.5 py-1.5 text-xs font-normal text-background',
          'shadow-[var(--sombra-flotante)] ring-1 ring-border',
        )}
      >
        {text}
      </span>
    </span>
  );
}
