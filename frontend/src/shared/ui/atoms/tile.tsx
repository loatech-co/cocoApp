import { Minus } from 'lucide-react';
import type { CSSProperties, PointerEvent, ReactNode } from 'react';

import { t } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { REALCE } from '@/shared/ui/foundations/superficie';

/**
 * Las baldosas de la rejilla de atajos: un icono y un nombre en un cuadrado.
 *
 * Arreglándolas, tiemblan y se arrastran; la que va en la mano se levanta con
 * la sombra flotante (levantar, no flotar: ver `superficie.test.ts`). Fuera de
 * ese modo son enlaces, y quien las dibuja como enlace usa `tileClass`.
 */
export function tileClass(isArranging: boolean, isDragging: boolean): string {
  return cn(
    'relative flex aspect-square flex-col items-center justify-center gap-2 rounded-lg bg-muted p-2 text-center text-foreground transition-colors',
    REALCE,
    // La baldosa que va en el dedo no tiembla: la animación pisaría el
    // desplazamiento en línea y se quedaría quieta bajo el dedo.
    isArranging && !isDragging && 'animate-[baldosa-tiembla_.4s_ease-in-out_infinite]',
    isDragging && 'z-10 scale-105 shadow-[var(--sombra-flotante)]',
  );
}

/** La baldosa mientras se arregla la rejilla: se agarra y se arrastra. */
export function MovableTile({
  isDragging,
  label,
  style,
  onGrab,
  onMove,
  onRelease,
  children,
}: {
  isDragging: boolean;
  label: string;
  style: CSSProperties | undefined;
  onGrab: (e: PointerEvent<HTMLElement>) => void;
  onMove: (e: PointerEvent<HTMLElement>) => void;
  onRelease: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={cn(tileClass(true, isDragging), 'w-full touch-none')}
      style={style}
      onPointerDown={onGrab}
      onPointerMove={onMove}
      onPointerUp={onRelease}
      onPointerCancel={onRelease}
      aria-label={t('ui.tile.move', { name: label })}
    >
      {children}
    </button>
  );
}

/**
 * El menos.
 *
 * 24, por debajo del suelo táctil de 42, y es una excepción CONCEDIDA,
 * no descubierta: se llega a él dentro de un modo al que se entra
 * manteniendo pulsada una baldosa, y uno más grande se pulsaría sin
 * querer justo al arrastrar, que es lo otro que se hace aquí.
 */
export function TileRemove({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}): ReactNode {
  return (
    <button
      type="button"
      onClick={onRemove}
      aria-label={t('ui.tile.remove', { name: label })}
      className="absolute -left-1 -top-1 grid size-6 place-items-center rounded-full bg-foreground text-background shadow-[var(--sombra-pegada)]"
    >
      <Minus className="size-3.5" strokeWidth={3} aria-hidden="true" />
    </button>
  );
}
