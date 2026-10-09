import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

import { moveShortcut } from '@/shared/lib/shortcuts';

import type { Mode } from './shortcut-types';

interface Drag {
  index: number;
  /** Desde dónde se mide el desplazamiento actual. Se reancla en cada salto. */
  x: number;
  y: number;
  dx: number;
  dy: number;
}

/** Sobre qué baldosa está el dedo, midiendo la rejilla de verdad. */
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

/** Arrastrar una baldosa sobre otra mientras se arregla la rejilla. */
export function useShortcutDrag(mode: Mode) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const grid = useRef<HTMLDivElement>(null);

  function handleDown(e: ReactPointerEvent<HTMLElement>, index: number): void {
    if (mode !== 'arreglando') return;
    e.preventDefault();
    // jsdom no lo trae, aunque el tipo diga que todo elemento lo tiene.
    if ('setPointerCapture' in e.currentTarget) e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ index, x: e.clientX, y: e.clientY, dx: 0, dy: 0 });
  }

  function handleMove(e: ReactPointerEvent<HTMLElement>): void {
    if (!drag) return;

    const target = indexUnder(grid.current, e.clientX, e.clientY);
    if (target !== null && target !== drag.index) {
      // Se escribe en el almacén y el render vuelve a dibujar desde él. El DOM
      // nunca es el registro.
      moveShortcut(drag.index, target);
      // Reanclado en el dedo: la baldosa acaba de saltar de hueco, así que su
      // desplazamiento vuelve a cero y se queda justo debajo.
      setDrag({ index: target, x: e.clientX, y: e.clientY, dx: 0, dy: 0 });
      return;
    }

    setDrag({ ...drag, dx: e.clientX - drag.x, dy: e.clientY - drag.y });
  }

  return { drag, setDrag, grid, handleDown, handleMove };
}
