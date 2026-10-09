import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

import { moveShortcut } from '@/shared/lib/shortcuts';

import type { Mode } from './shortcut-types';

interface Drag {
  index: number;
  /** Where the current offset is measured from. Re-anchored on every jump. */
  x: number;
  y: number;
  dx: number;
  dy: number;
}

/** Which tile the finger is over, measuring the real grid. */
function indexUnder(grid: HTMLDivElement | null, x: number, y: number): number | null {
  const cells = grid?.querySelectorAll('[data-baldosa]');
  if (!cells) return null;

  for (let i = 0; i < cells.length; i += 1) {
    const cell = cells[i];
    if (cell === undefined) continue;
    const r = cell.getBoundingClientRect();
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return i;
  }
  return null;
}

/** Dragging one tile over another while the grid is being arranged. */
export function useShortcutDrag(mode: Mode) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const grid = useRef<HTMLDivElement>(null);

  function handleDown(e: ReactPointerEvent<HTMLElement>, index: number): void {
    if (mode !== 'arreglando') return;
    e.preventDefault();
    // jsdom does not ship it, even though the type says every element has it.
    if ('setPointerCapture' in e.currentTarget) e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ index, x: e.clientX, y: e.clientY, dx: 0, dy: 0 });
  }

  function handleMove(e: ReactPointerEvent<HTMLElement>): void {
    if (!drag) return;

    const target = indexUnder(grid.current, e.clientX, e.clientY);
    if (target !== null && target !== drag.index) {
      // It is written to the store and the render draws again from it. The DOM
      // is never the record.
      moveShortcut(drag.index, target);
      // Re-anchored on the finger: the tile just jumped slots, so its offset
      // goes back to zero and it stays right underneath.
      setDrag({ index: target, x: e.clientX, y: e.clientY, dx: 0, dy: 0 });
      return;
    }

    setDrag({ ...drag, dx: e.clientX - drag.x, dy: e.clientY - drag.y });
  }

  return { drag, setDrag, grid, handleDown, handleMove };
}
