import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

import { useEscape, useFocusTrap } from '@/shared/lib/focus';
import { useSwipeToClose } from '@/shared/lib/swipe';
import { cn } from '@/shared/lib/utils';
import { FLOATING_SURFACE } from '@/shared/ui/foundations/surface';

interface BottomSheetProps {
  isOpen: boolean;
  /** Its accessible name. What is shown is decided by `head`. */
  title: string;
  head?: ReactNode;
  /**
   * Which layer it is drawn on.
   *
   * By default it sits at `z-40`: above the shell —the bar is at 15 and the
   * top bar at 20— and below a sheet (modal), which lives at 50.
   *
   * Whoever comes OUT OF something that is already on top raises it: a menu's
   * dropdown opens from inside a modal, so a sheet at 40 would be drawn
   * behind the modal that asked for it.
   */
  layer?: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * A panel that rises from the bottom edge.
 *
 * ── Why it is mounted once and FILLED ───────────────────────────────────────
 * Everything else in this folder is drawn whole on every render. This
 * cannot be: the slide is a CSS transition, and an element rebuilt
 * on every render has no previous position to travel from — it would appear,
 * it would never arrive.
 *
 * That is why it is ALWAYS mounted, open or closed, and what changes is its content
 * and its state. In React that means the call site never does
 * `{isOpen && <BottomSheet />}`: that is rebuilding it.
 *
 * ── Why it sits against the `body` ──────────────────────────────────────────
 * So that there is ONE sheet per document and not one per screen. It is a fixed
 * layer: where it lives in the tree changes nothing about where it paints, and against the
 * `body` it stays in front of any card with `overflow` that would have
 * clipped it.
 *
 * ── The four exits ──────────────────────────────────────────────────────────
 * The handle, the scrim, Escape and swiping down. A panel that can be
 * opened and not closed is the design flaw in its purest form, so all
 * four belong to the component: none is left to whoever opens it.
 */
export function BottomSheet({
  isOpen,
  title,
  head,
  layer = 'z-40',
  onClose,
  children,
}: BottomSheetProps) {
  const panel = useRef<HTMLDivElement>(null);
  const [column, height] = useMeasuredHeight();
  const visits = useVisitCount(isOpen);

  useEscape(isOpen, onClose);
  useFocusTrap(panel, isOpen);
  useSwipeToClose({ element: panel, direction: 'down', isEnabled: isOpen, onClose });

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      // The scrim. It fades; it is not mounted and unmounted: an element that
      // has just been born has no previous opacity to travel from.
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      className={cn(
        'fixed inset-0 bg-[var(--scrim)] transition-opacity duration-200 ease-[ease]',
        layer,
        isOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
      )}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-surface="panel"
        data-open={isOpen ? 'yes' : 'no'}
        // Closed is not just invisible: it is not tabbable. A hidden panel that
        // keeps its eight links in the keyboard order is a page that
        // has twice as many stops as it shows.
        inert={!isOpen}
        tabIndex={-1}
        style={{ height: height ?? undefined }}
        className={sheetClass(isOpen)}
      >
        <div ref={column} className="flex max-h-[88dvh] flex-col">
          <SheetContent title={title} head={head} visits={visits}>
            {children}
          </SheetContent>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * The handle.
 *
 * It is an INDICATOR, not a control: it says this can be dragged and from
 * where. That is why it is exempt from the 42 touch floor and why the gesture is read
 * on the whole panel and not on top of it — aiming at a 5px line with the thumb
 * would be a worse gesture than the one it replaces.
 *
 * On the bottom edge this goes and not an X: an X in the head of a
 * panel that rises from below competes with the title, and the edge is already there.
 */
function Handle() {
  return (
    <div className="flex h-8 w-full items-center justify-center" aria-hidden="true">
      <span className="h-[5px] w-[72px] rounded-full bg-muted-foreground/40" />
    </div>
  );
}

/**
 * The height is MEASURED.
 *
 * The panel measures what its content measures —six tiles are two rows; the
 * list of pages is the full height—, and going from one to another was a jump
 * while entering and leaving were smooth.
 *
 * And it is measured instead of left at `auto` because a transition needs two
 * defined values: from `auto` to `auto` the declared value does not change, so
 * there is nothing to animate however much the content measures something else.
 * `interpolate-size` solves going FROM a keyword TO a number, which is
 * another problem. With the measurement, the height is always a number.
 */
function useMeasuredHeight(): [RefObject<HTMLDivElement | null>, number | null] {
  const column = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = column.current;
    if (!el || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(() => setHeight(el.offsetHeight));
    observer.observe(el);
    setHeight(el.offsetHeight);
    return () => observer.disconnect();
  }, []);
  return [column, height];
}

function useVisitCount(isOpen: boolean): number {
  // Every opening is a new visit. The key remounts the content, and that
  // does two things in one: it triggers the enter animation —which runs by
  // EXISTING, because the body is replaced whole— and it returns to its initial
  // state anything that was half done. A screen that reopens
  // in the middle of an edit is a screen that reopens badly.
  //
  // It is STATE and not a ref: it is read in render —it goes in the `key`—, and a ref
  // read in render is exactly what the rule of refs forbids, because
  // React does not find out it changed. The adjustment goes in the render itself, which
  // is what React documents for "state that depends on the previous one": it counts
  // only the transition from closed to open, and not the mount.
  const [visits, setVisits] = useState(0);
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) setVisits((v) => v + 1);
  }
  return visits;
}

/** The sheet: where it is, its edge and how it travels. */
function sheetClass(isOpen: boolean): string {
  return cn(
    'fixed inset-x-0 bottom-0 flex max-h-[88dvh] flex-col overflow-hidden outline-none',
    /*
      Only on top: the bottom corners fall off the screen and
      rounding them leaves two notches of the background.

      ── And 16px, above the standard radius ───────────────────────────
      It is the second exception in the app, next to the well, and for the same
      reason: this corner measures the FULL WIDTH of the screen, and on
      such a long edge 10px can barely be seen. What the curve has to
      tell —that this is a sheet that ROSE and that the page is still
      underneath— depends on it being seen.

      And it does not break the rule, which talks about NEIGHBORING containers: the panel
      has no neighbors, it is on top of everything. It is registered with its
      reason in `shared/ui/radius.test.ts`.
    */
    'rounded-t-[16px]',
    FLOATING_SURFACE,
    // The same duration and the same curve for the travel and for the height:
    // it grows and shrinks with the same gesture it arrived with.
    'transition-[transform,height] duration-[220ms] ease-[cubic-bezier(.4,0,.2,1)]',
    isOpen ? 'translate-y-0' : 'translate-y-full',
    // The whole panel belongs to the gesture; the body keeps its own so it
    // can scroll, and does not pass it to the page behind.
    'touch-none',
  );
}

function SheetContent({
  title,
  head,
  visits,
  children,
}: Pick<BottomSheetProps, 'title' | 'head' | 'children'> & { visits: number }) {
  return (
    <>
      {/* ── The head ──────────────────────────────────────────────────
          With a 78px floor. A head with a single title line is
          so short that two panels of the same family opened at different
          heights, and what the eye reads as changed is the head. One
          with a search box is taller because its CONTENT is taller, which is
          the only reason it should go past the floor.

          A box, 24 on the sides; 12 down to the body. A head is
          read by its EDGES, not by its parts.

          24 and not 16: with 16, the title and the first line of the body
          sat almost flush with the edge of the screen —the sheet takes the
          full width, so its padding is the ONLY thing that separates what is
          written from the edge of the phone— and the text read as cramped. */}
      <div className="min-h-[78px] shrink-0 px-6 pb-3">
        <Handle />
        {head ?? <h2 className="font-display text-lg font-semibold">{title}</h2>}
      </div>

      {/* The safe edge goes in the BODY PADDING and not on the panel: a
          padded panel leaves a dead strip of color under the
          scroll instead of letting the content pass underneath.

          24 on the sides, the same as the head: two different insets
          look like a step on the left edge of the sheet.

          And 30 at the bottom, more than the sides on purpose: there is no screen
          edge there but the bottom edge of the phone, where the go-home
          gesture lives. The last row needs more air than the
          others so it does not end up under it. */}
      <div
        key={visits}
        data-body
        className="min-h-0 flex-1 touch-pan-y overscroll-contain px-6 pb-[calc(30px+env(safe-area-inset-bottom,0px))] [overflow-y:auto]"
      >
        {children}
      </div>
    </>
  );
}
