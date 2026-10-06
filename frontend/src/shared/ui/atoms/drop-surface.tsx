import type { ReactNode } from 'react';

import { cn } from '@/shared/lib/utils';
import { REALCE_DE_SUPERFICIE } from '@/shared/ui/foundations/superficie';

/**
 * El cuadro punteado donde se sueltan archivos o se pulsa para elegirlos.
 *
 * ── Una CAJA, no un botón ───────────────────────────────────────────────────
 * Un botón dentro de otro no es HTML válido, y dentro del cuadro caben otros
 * controles (el de pegar una captura). Así que el cuadro es una caja, y quien
 * responde al clic es un botón SIN contenido que la cubre entera y va primero:
 * lo que se lee encima no intercepta el ratón, y el clic cae donde caiga. Lo
 * que tenga que pulsarse aparte lleva `relative` para quedar por encima.
 *
 * | Forma      | Dónde                                                  |
 * | ---------- | ------------------------------------------------------ |
 * | `cuadro`   | Junto a las miniaturas: una baldosa más, de 104        |
 * | `completa` | Sin nada al lado: ocupa el ancho y el alto que le den  |
 *
 * `encima` mientras se arrastra algo por encima; `ocupada` mientras se sube.
 */
export function DropSurface({
  shape,
  isOver,
  isBusy,
  label,
  onPick,
  children,
}: {
  shape: 'square' | 'full';
  isOver: boolean;
  isBusy: boolean;
  /** El nombre accesible del botón que la cubre: «Agregar soportes». */
  label: string;
  onPick: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        'relative flex flex-col items-center justify-center gap-1.5 rounded-lg',
        'border-2 border-dashed transition-colors',
        shape === 'full' ? 'min-h-36 flex-1 px-4 py-8' : 'size-[104px]',
        isBusy
          ? 'cursor-wait border-border text-muted-foreground'
          : isOver
            ? 'border-acento-tinta bg-accent text-accent-foreground'
            : cn('border-border text-muted-foreground', REALCE_DE_SUPERFICIE),
      )}
    >
      {/* Sin anillo propio: el foco de un botón lo resuelve `index.css` para
          todos a la vez (regla 18). */}
      <button
        type="button"
        onClick={onPick}
        disabled={isBusy}
        aria-label={label}
        className="absolute inset-0 rounded-lg"
      />
      {children}
    </div>
  );
}
