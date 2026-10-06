import { useEffect, useRef, useState, type CSSProperties } from 'react';

/**
 * Opening, closing and placing a dropdown.
 *
 * It is what `Menu` knows how to do and does not draw: that is why it lives in
 * `lib` and not in the UI. The drawing —the surface, the origin, the width—
 * stays in `shared/ui/molecules/menu.tsx`.
 */

/** Where the trigger is in the window, measured on opening. */
export interface Anchor {
  top: number;
  left: number;
  /** What is left from the trigger's right edge to the window. */
  right: number;
  width: number;
}

export function useMenuState(isSheet: boolean) {
  const [isOpen, setIsOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);

  // Measured on opening: the box's position in the window is all it takes
  // to place a panel that no longer depends on it.
  function measure(): void {
    const r = box.current?.getBoundingClientRect();
    if (r) {
      setAnchor({
        top: r.bottom,
        left: r.left,
        right: window.innerWidth - r.right,
        width: r.width,
      });
    }
  }

  /*
    Close on a tap outside and with Escape — but only when the panel hangs
    from the button. The sheet brings its own four exits —the handle, the
    scrim, Escape and swiping down—, and on top of that it lives PORTALED to
    `body`: for this box, any tap inside the sheet is a tap «outside», so
    picking an option would have closed it before the click arrived.
  */
  useEffect(() => {
    if (!isOpen || isSheet) return;

    const onOutside = (e: MouseEvent): void => {
      if (box.current && !box.current.contains(e.target as Node)) setIsOpen(false);
    };
    const onEscape = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('mousedown', onOutside);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('keydown', onEscape);
    };
  }, [isOpen, isSheet]);

  return { isOpen, setIsOpen, box, anchor, measure };
}

/** Where a floating panel is placed, measured against the window. */
export function panelStyle(
  anchor: Anchor,
  hasOwnWidth: boolean,
  align: 'left' | 'right',
): CSSProperties {
  /*
    The height, down to the bottom edge of the window and not one pixel more.

    The panel is `fixed` and hangs from the trigger's bottom edge. Opened
    from a field halfway down a phone screen, whatever did not fit fell
    outside the window: it could not be seen or tapped, and there was nothing
    to scroll to reach it. With the cap, the panel scrolls inside.
  */
  const heightCap = { maxHeight: `calc(100dvh - ${anchor.top + 16}px)` };
  // The SAME width as the field, not a minimum: a panel wider than its
  // trigger reads as another element, and a narrower one cuts the options
  // the field does show in full.
  if (!hasOwnWidth) {
    return {
      top: `${anchor.top + 8}px`,
      left: `${anchor.left}px`,
      width: `${anchor.width}px`,
      ...heightCap,
    };
  }
  /*
    It is anchored by the edge `align` names, and not always by the left.

    Always anchoring to the left, a wide panel hanging from a control that
    lives at the end of a bar —the date range— grows out of the screen: it
    either spills over, or the clipping leaves it half as wide. From the
    right it grows inward, which is where there is room.

    The cap is always what is left up to the opposite edge: what spills out
    of the window cannot be tapped.
  */
  return align === 'right'
    ? {
        top: `${anchor.top + 8}px`,
        right: `${anchor.right}px`,
        maxWidth: `calc(100vw - ${anchor.right}px - 1rem)`,
        ...heightCap,
      }
    : {
        top: `${anchor.top + 8}px`,
        left: `${anchor.left}px`,
        maxWidth: `calc(100vw - ${anchor.left}px - 1rem)`,
        ...heightCap,
      };
}
