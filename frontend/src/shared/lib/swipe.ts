import { type RefObject, useEffect, useEffectEvent } from 'react';

/**
 * Swipe to close.
 *
 * ── Why it is not a component ───────────────────────────────────────────────
 * Because it has no shape. There is nothing to draw, no slot to fill, nothing
 * Figma could hold. Nor does it have CSS of its own: every panel it moves
 * already declares its open position and its closed position, and this only
 * borrows the space between the two.
 *
 * ── Which way ───────────────────────────────────────────────────────────────
 * `direction` names the direction that CLOSES, which is always the direction
 * the panel came from. One that rose from the bottom goes back down; the
 * sections one, which came in from the right, goes back to the right. Anything
 * else is a gesture that has to be learned instead of guessed.
 *
 * ── Pointer events, never touch events ──────────────────────────────────────
 * `touchstart/touchmove/touchend` will not do: a desktop browser at a narrow
 * window —which is how each of these panels gets reviewed— fires NO touch
 * events at all, so the gesture did not exist where it was being tried.
 */

/** How far to travel before this stops being a tremor. */
const RECOGNITION_PX = 8;

/**
 * How far to travel for it to let go.
 *
 * 120 and not 60: closing is the expensive thing to undo —you have to open
 * again and get back to where you were—, so the threshold sits where it can
 * no longer be a graze.
 */
export const CLOSE_THRESHOLD = 120;

export type SwipeDirection = 'down' | 'up' | 'right' | 'left';

const AXIS: Record<SwipeDirection, 'x' | 'y'> = {
  down: 'y',
  up: 'y',
  right: 'x',
  left: 'x',
};

/** How far it has moved TOWARD closing. Negative is going the other way. */
export function progressAlong(direction: SwipeDirection, dx: number, dy: number): number {
  if (direction === 'down') return dy;
  if (direction === 'up') return -dy;
  if (direction === 'right') return dx;
  return -dx;
}

/** What moves on the other axis. If this wins, the gesture is not ours. */
function crossOffset(direction: SwipeDirection, dx: number, dy: number): number {
  return Math.abs(AXIS[direction] === 'y' ? dx : dy);
}

/**
 * Whether the gesture started inside something that can STILL scroll that way.
 *
 * Because then it is not a close, it is a scroll: a panel whose list is
 * halfway down closes only once the list is back at its edge.
 */
export function canScrollToward(
  from: Element | null,
  boundary: Element,
  direction: SwipeDirection,
): boolean {
  let node: Element | null = from;

  while (node && node !== boundary.parentElement) {
    const style = typeof getComputedStyle === 'function' ? getComputedStyle(node) : null;
    const overflow = AXIS[direction] === 'y' ? style?.overflowY : style?.overflowX;
    // `auto` and `scroll` ARE scrollable; `clip`, `hidden` and `visible` are not.
    // Counting them wrong is exactly the bug: the panel moves and the list does not.
    const isScrollable = overflow === 'auto' || overflow === 'scroll';

    if (isScrollable) {
      const remainingTop = node.scrollTop;
      const remainingBottom = node.scrollHeight - node.clientHeight - node.scrollTop;
      const remainingLeft = node.scrollLeft;
      const remainingRight = node.scrollWidth - node.clientWidth - node.scrollLeft;

      // Dragging down reveals what is ABOVE: whoever still has something
      // unshown above consumes it.
      const remaining =
        direction === 'down'
          ? remainingTop
          : direction === 'up'
            ? remainingBottom
            : direction === 'right'
              ? remainingLeft
              : remainingRight;

      if (remaining > 1) return true;
    }

    if (node === boundary) break;
    node = node.parentElement;
  }

  return false;
}

export function useSwipeToClose({
  element,
  direction,
  isEnabled,
  onClose,
}: {
  element: RefObject<HTMLElement | null>;
  direction: SwipeDirection;
  /** Only while open: a closed panel is not dragged. */
  isEnabled: boolean;
  onClose: () => void;
}): void {
  /**
   * The close, as an effect event.
   *
   * If the effect depended on `onClose` —which in practice is a new function
   * on every render— it would hook itself up again every time, and its cleanup
   * would wipe the inline `transform` IN THE MIDDLE OF A DRAG: the panel would
   * stand still under the finger as soon as anything else on the screen
   * re-rendered.
   *
   * `useEffectEvent` is React's piece for this: a stable function that always
   * calls the latest version, without entering the dependencies. It used to be
   * a ref written during render, which does the same by hand and is what the
   * rule of refs forbids.
   */
  const handleClose = useEffectEvent(onClose);

  useEffect(() => {
    const el = element.current;
    if (!el || !isEnabled) return;

    const gesture: Drag = { el, direction, start: null, isRecognized: false, progress: 0 };
    const onPointerDown = (e: PointerEvent): void => startDrag(gesture, e);
    const onPointerMove = (e: PointerEvent): void => moveDrag(gesture, e);
    const onPointerUp = (): void => endDrag(gesture, () => handleClose());

    el.addEventListener('pointerdown', onPointerDown as EventListener);
    el.addEventListener('pointermove', onPointerMove as EventListener);
    el.addEventListener('pointerup', onPointerUp as EventListener);
    el.addEventListener('pointercancel', onPointerUp as EventListener);

    return () => {
      el.removeEventListener('pointerdown', onPointerDown as EventListener);
      el.removeEventListener('pointermove', onPointerMove as EventListener);
      el.removeEventListener('pointerup', onPointerUp as EventListener);
      el.removeEventListener('pointercancel', onPointerUp as EventListener);
      releaseElement(el);
    };
  }, [element, direction, isEnabled]);
}

/** A drag in progress on a panel. */
interface Drag {
  el: HTMLElement;
  direction: SwipeDirection;
  start: { x: number; y: number } | null;
  isRecognized: boolean;
  progress: number;
}

/** Returns the panel to whatever its CSS says. */
function releaseElement(el: HTMLElement): void {
  el.style.transform = '';
  el.style.transition = '';
}

function startDrag(gesture: Drag, e: PointerEvent): void {
  if (e.button > 0) return;

  // The target may not be an element —the document, a text node—, and
  // those have no `closest`.
  const target = e.target;
  // A region that handles the pointer itself —a grid while it is being
  // reordered— keeps the whole gesture.
  if (target instanceof Element && target.closest('[data-no-swipe]')) return;

  gesture.start = { x: e.clientX, y: e.clientY };
  gesture.isRecognized = false;
  gesture.progress = 0;
}

function moveDrag(gesture: Drag, e: PointerEvent): void {
  const { el, direction, start } = gesture;
  if (!start) return;

  const dx = e.clientX - start.x;
  const dy = e.clientY - start.y;
  gesture.progress = progressAlong(direction, dx, dy);

  if (!gesture.isRecognized && !recognize(gesture, e, crossOffset(direction, dx, dy))) return;

  // It is not dragged the other way: the panel is already in place.
  const travel = Math.max(0, gesture.progress);
  el.style.transform =
    AXIS[direction] === 'y'
      ? `translateY(${direction === 'down' ? travel : -travel}px)`
      : `translateX(${direction === 'right' ? travel : -travel}px)`;
}

/** Decides whether what started is this gesture. If it is not, abandons it. */
function recognize(gesture: Drag, e: PointerEvent, crossOffset: number): boolean {
  const { el, direction, progress } = gesture;
  if (Math.abs(progress) < RECOGNITION_PX && crossOffset < RECOGNITION_PX) return false;

  // It goes the other way, or sideways: not this gesture.
  if (progress <= 0 || crossOffset > Math.abs(progress)) {
    gesture.start = null;
    return false;
  }

  if (canScrollToward(e.target as Element | null, el, direction)) {
    gesture.start = null;
    return false;
  }

  gesture.isRecognized = true;
  // jsdom does not have it, even though the type says every element does.
  if ('setPointerCapture' in el) el.setPointerCapture(e.pointerId);
  // Inline and not in a class: with its own curve on top, the panel
  // arrives late to where the finger already is.
  el.style.transition = 'none';
  return true;
}

function endDrag(gesture: Drag, handleClose: () => void): void {
  if (!gesture.start || !gesture.isRecognized) {
    gesture.start = null;
    return;
  }
  gesture.start = null;
  gesture.isRecognized = false;

  if (gesture.progress <= CLOSE_THRESHOLD) {
    // It stays: the control is released and its own transition brings it back.
    releaseElement(gesture.el);
    return;
  }

  handleClose();

  /**
   * THE NEXT FRAME, and that is the whole trick.
   *
   * Removing the inline `transform` BEFORE the host closes returns the panel
   * to its open position for one frame and slides it from there: it reads as
   * a bounce. Removing it one frame LATER is what turns a drag and a
   * transition into a single continuous movement.
   */
  requestAnimationFrame(() => releaseElement(gesture.el));
}
