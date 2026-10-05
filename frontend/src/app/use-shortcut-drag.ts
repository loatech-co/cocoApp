import { useRef, useState, type PointerEvent as PointerEventoDeReact } from 'react';

import { moverAtajo } from '@/shared/lib/atajos';

import type { Estado } from './shortcut-types';

interface Arrastre {
  indice: number;
  /** Desde dónde se mide el desplazamiento actual. Se reancla en cada salto. */
  x: number;
  y: number;
  dx: number;
  dy: number;
}

/** Sobre qué baldosa está el dedo, midiendo la rejilla de verdad. */
function indiceBajo(rejilla: HTMLDivElement | null, x: number, y: number): number | null {
  const celdas = rejilla?.querySelectorAll('[data-baldosa]');
  if (!celdas) return null;

  for (let i = 0; i < celdas.length; i += 1) {
    const celda = celdas[i];
    if (celda === undefined) continue;
    const r = celda.getBoundingClientRect();
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return i;
  }
  return null;
}

/** Arrastrar una baldosa sobre otra mientras se arregla la rejilla. */
export function useShortcutDrag(estado: Estado) {
  const [arrastre, setArrastre] = useState<Arrastre | null>(null);
  const rejilla = useRef<HTMLDivElement>(null);

  function alBajar(e: PointerEventoDeReact<HTMLElement>, indice: number): void {
    if (estado !== 'arreglando') return;
    e.preventDefault();
    // jsdom no lo trae, aunque el tipo diga que todo elemento lo tiene.
    if ('setPointerCapture' in e.currentTarget) e.currentTarget.setPointerCapture(e.pointerId);
    setArrastre({ indice, x: e.clientX, y: e.clientY, dx: 0, dy: 0 });
  }

  function alMover(e: PointerEventoDeReact<HTMLElement>): void {
    if (!arrastre) return;

    const destino = indiceBajo(rejilla.current, e.clientX, e.clientY);
    if (destino !== null && destino !== arrastre.indice) {
      // Se escribe en el almacén y el render vuelve a dibujar desde él. El DOM
      // nunca es el registro.
      moverAtajo(arrastre.indice, destino);
      // Reanclado en el dedo: la baldosa acaba de saltar de hueco, así que su
      // desplazamiento vuelve a cero y se queda justo debajo.
      setArrastre({ indice: destino, x: e.clientX, y: e.clientY, dx: 0, dy: 0 });
      return;
    }

    setArrastre({ ...arrastre, dx: e.clientX - arrastre.x, dy: e.clientY - arrastre.y });
  }

  return { arrastre, setArrastre, rejilla, alBajar, alMover };
}
