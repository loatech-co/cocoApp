import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

/**
 * Un interruptor de encendido y apagado.
 *
 * ── Cuándo esto y cuándo una casilla ────────────────────────────────────────
 * La casilla es para ELEGIR de una lista: marcar tres centros de costos entre
 * diez. El interruptor es para ENCENDER algo que cambia lo que se ve —aquí,
 * una sección entera de campos que aparece debajo—. Son dos gestos distintos y
 * se leen distinto: uno responde "¿cuáles?", el otro "¿sí o no?".
 *
 * El `<input>` sigue debajo, invisible: el teclado, el foco y los lectores de
 * pantalla funcionan igual que con cualquier casilla.
 */
export function Interruptor({ className, ...props }: ComponentProps<'input'>) {
  return (
    <span className="relative inline-flex shrink-0">
      <input type="checkbox" role="switch" className="peer absolute inset-0 z-10 cursor-pointer opacity-0" {...props} />
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none flex h-6 w-10 items-center rounded-full p-0.5 transition-colors',
          'bg-input peer-checked:bg-primary peer-checked:[&>span]:translate-x-4',
          'peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background',
          'peer-disabled:opacity-40',
          className,
        )}
      >
        <span className="size-5 rounded-full bg-card shadow-sm transition-transform" />
      </span>
    </span>
  );
}
