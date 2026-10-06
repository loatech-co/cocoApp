import {
  type CSSProperties,
  type PointerEvent,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from 'react';

import { useOnChange } from './on-change';

interface Size {
  width: number;
  height: number;
}

interface Point {
  x: number;
  y: number;
}

/** An element's box, measured again every time it changes size. */
function useMeasuredBox(ref: RefObject<HTMLElement | null>): Size {
  const [box, setBox] = useState<Size>({ width: 0, height: 0 });

  // The box changes size with the window, and the bounds depend on it.
  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const measure = (): void =>
      setBox({ width: element.clientWidth, height: element.clientHeight });

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return box;
}

/** Dragging with `pointer`: the same code serves the mouse, the finger and the pen. */
function useDragToPan(isEnabled: boolean, pos: Point, onMove: (to: Point) => void) {
  const grip = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const release = (): void => {
    grip.current = null;
    setIsDragging(false);
  };

  return {
    isDragging,
    handlers: {
      onPointerDown: (e: PointerEvent<HTMLElement>) => {
        if (!isEnabled) return;
        /*
          The zoom controls drag nothing.

          Here was the bug that made zoom "not work": on pressing a control,
          this frame took `setPointerCapture` for the drag, and capture ALSO
          REDIRECTS the `click` to the element that captured. The zoom state
          never changed because the button's `onClick` never got to fire.
        */
        if ((e.target as HTMLElement).closest('[data-zoom-controls]')) return;

        e.currentTarget.setPointerCapture(e.pointerId);
        grip.current = { x: pos.x, y: pos.y, px: e.clientX, py: e.clientY };
        setIsDragging(true);
      },
      onPointerMove: (e: PointerEvent<HTMLElement>) => {
        const origin = grip.current;
        if (!origin) return;
        onMove({ x: origin.x + (e.clientX - origin.px), y: origin.y + (e.clientY - origin.py) });
      },
      onPointerUp: release,
      onPointerCancel: release,
    },
  };
}

/**
 * A document that FILLS its box and is explored by dragging.
 *
 * ── Why it fills the box and does not fit whole ─────────────────────────────
 * Because a whole page squeezed into a short box leaves the text at a size at
 * which the total cannot be read. Filling the box, the document shows at the
 * size at which it can be checked, and what does not fit is reached by
 * dragging.
 *
 * ── The bounds ──────────────────────────────────────────────────────────────
 * The offset is clamped to what is left to see, so a gap never appears: the
 * document's edge does not go past the box's edge. And if on the short side
 * the document fits exactly, that axis does not move —instead of trembling a
 * pixel on every drag—.
 *
 * `steps` are the zoom jumps, as multiples of the scale that fills the box;
 * the first one is 100 %. `frame` is the box: whoever paints it creates it.
 */
export function usePanZoom(frame: RefObject<HTMLElement | null>, steps: readonly number[]) {
  const box = useMeasuredBox(frame);
  /** The natural size of what is drawn, to know how much is left over on each side. */
  const [natural, setNatural] = useState<Size | null>(null);
  const [pos, setPos] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(0);

  // The scale that FILLS the box: the larger of the two ratios. With the
  // smaller —which is `contain`— there would be empty strips at the sides.
  const coverScale =
    natural && box.width > 0 ? Math.max(box.width / natural.width, box.height / natural.height) : 1;
  // `zoom` never leaves `steps`: the buttons clamp it.
  const step = steps[zoom] ?? 1;
  const scale = coverScale * step;
  const width = natural ? natural.width * scale : 0;
  const height = natural ? natural.height * scale : 0;

  /** How far each axis can move. Negative: it is what is left to see. */
  const bounds = { x: Math.min(0, box.width - width), y: Math.min(0, box.height - height) };
  const clamp = ({ x, y }: Point): Point => ({
    x: Math.min(0, Math.max(bounds.x, x)),
    y: Math.min(0, Math.max(bounds.y, y)),
  });

  // It starts CENTERED, and recenters when the zoom changes: zooming in from
  // a corner leaves you looking at a blank margin instead of what you were
  // reading. Only when the document, the box or the zoom changes: recentering
  // on every drag would fight the finger.
  useOnChange([natural, box.width, box.height, zoom], () => {
    if (!natural || box.width === 0) return;
    setPos(clamp({ x: bounds.x / 2, y: bounds.y / 2 }));
  });

  const canPan = bounds.x < 0 || bounds.y < 0;
  const drag = useDragToPan(canPan, pos, (a) => setPos(clamp(a)));

  const framing: CSSProperties = {
    position: 'absolute',
    left: pos.x,
    top: pos.y,
    width: width || undefined,
    height: height || undefined,
    // Before measuring it paints invisible: a frame with the document at its
    // natural size and unframed looks like a jump.
    visibility: natural ? 'visible' : 'hidden',
  };

  return { setNatural, zoom, setZoom, step, framing, canPan, ...drag };
}
