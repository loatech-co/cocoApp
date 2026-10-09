import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';

import { CANVAS_HEIGHT, xAt, yAt } from '@/features/transactions/model/trend';

interface Size {
  width: number;
  height: number;
}

/**
 * Which point of the chart is being pointed at —with the finger, the pointer or the
 * arrows— and where the card that explains it goes.
 */
export function useTrendPointer(total: number) {
  const canvas = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<number | null>(null);
  /** The canvas size in pixels, to place the card without it spilling out. */
  const [box, setBox] = useState<Size>({ width: 0, height: 0 });
  const [cardSize, setCardSize] = useState<Size>({ width: 0, height: 0 });

  // It is measured AFTER painting and before the browser draws: measuring in
  // render the card does not exist yet, and measuring in a normal effect
  // a frame with the card in the wrong place would be seen.
  useLayoutEffect(() => {
    if (!card.current) return;
    const { offsetWidth, offsetHeight } = card.current;
    setCardSize((previous) =>
      previous.width === offsetWidth && previous.height === offsetHeight
        ? previous
        : { width: offsetWidth, height: offsetHeight },
    );
  }, [active]);

  /** The point closest to the finger or the pointer. */
  function point(clientX: number): void {
    const size = canvas.current?.getBoundingClientRect();
    if (!size || size.width === 0) return;

    setBox({ width: size.width, height: size.height });
    const fraction = (clientX - size.left) / size.width;
    const index = Math.round(fraction * (total - 1));
    setActive(Math.min(total - 1, Math.max(0, index)));
  }

  function withKeyboard(e: KeyboardEvent): void {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();

    // With the keyboard there is no pointer, so the measurement has to be taken here.
    const size = canvas.current?.getBoundingClientRect();
    if (size) setBox({ width: size.width, height: size.height });

    const step = e.key === 'ArrowLeft' ? -1 : 1;
    const from = active ?? (step === 1 ? -1 : total);
    setActive(Math.min(total - 1, Math.max(0, from + step)));
  }

  return { canvas, card, active, setActive, box, cardSize, point, withKeyboard };
}

/**
 * Where the card goes.
 *
 * Next to the pointer, twelve pixels away, and jumping to the other side when it does not
 * fit: stuck to a fixed end it forces looking elsewhere to read the
 * fact of the point being pointed at, and following the pointer without more it
 * runs off the chart at the edges.
 */
export function cardPosition({
  index,
  total,
  value,
  ceiling,
  box,
  cardSize,
}: {
  index: number;
  total: number;
  value: number;
  ceiling: number;
  box: Size;
  cardSize: Size;
}): { left: number; top: number } {
  const px = (xAt(index, total) / 100) * box.width;
  const py = (yAt(value, ceiling) / CANVAS_HEIGHT) * box.height;
  const MARGIN = 12;

  const canFitRight = px + MARGIN + cardSize.width <= box.width;
  const left = canFitRight ? px + MARGIN : Math.max(0, px - MARGIN - cardSize.width);
  const top = Math.min(
    Math.max(0, py - cardSize.height / 2),
    Math.max(0, box.height - cardSize.height),
  );

  return { left, top };
}
