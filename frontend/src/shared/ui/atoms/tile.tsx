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
export function tileClass(arreglando: boolean, arrastrada: boolean): string {
  return cn(
    'relative flex aspect-square flex-col items-center justify-center gap-2 rounded-lg bg-muted p-2 text-center text-foreground transition-colors',
    REALCE,
    // La baldosa que va en el dedo no tiembla: la animación pisaría el
    // desplazamiento en línea y se quedaría quieta bajo el dedo.
    arreglando && !arrastrada && 'animate-[baldosa-tiembla_.4s_ease-in-out_infinite]',
    arrastrada && 'z-10 scale-105 shadow-[var(--sombra-flotante)]',
  );
}

/** La baldosa mientras se arregla la rejilla: se agarra y se arrastra. */
export function MovableTile({
  arrastrada,
  etiqueta,
  estilo,
  onBajar,
  onMover,
  onSoltar,
  children,
}: {
  arrastrada: boolean;
  etiqueta: string;
  estilo: CSSProperties | undefined;
  onBajar: (e: PointerEvent<HTMLElement>) => void;
  onMover: (e: PointerEvent<HTMLElement>) => void;
  onSoltar: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={cn(tileClass(true, arrastrada), 'w-full touch-none')}
      style={estilo}
      onPointerDown={onBajar}
      onPointerMove={onMover}
      onPointerUp={onSoltar}
      onPointerCancel={onSoltar}
      aria-label={t('ui.tile.move', { name: etiqueta })}
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
  etiqueta,
  onQuitar,
}: {
  etiqueta: string;
  onQuitar: () => void;
}): ReactNode {
  return (
    <button
      type="button"
      onClick={onQuitar}
      aria-label={t('ui.tile.remove', { name: etiqueta })}
      className="absolute -left-1 -top-1 grid size-6 place-items-center rounded-full bg-foreground text-background shadow-[var(--sombra-pegada)]"
    >
      <Minus className="size-3.5" strokeWidth={3} aria-hidden="true" />
    </button>
  );
}
