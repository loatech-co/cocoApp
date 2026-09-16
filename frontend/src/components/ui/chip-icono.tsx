import type { ComponentType } from 'react';

import { cn } from '@/lib/utils';

/**
 * Los pasteles con los que la app marca sus cosas.
 *
 * Viven aquí y no en cada pantalla porque el COLOR SIGNIFICA: el violeta es el
 * gasto en el indicador de arriba y tiene que ser el violeta en el menú que lo
 * registra. Repetidos en dos sitios, un día alguien cambia uno y la misma cosa
 * pasa a tener dos colores según por dónde se entre.
 */
export const CHIPS = {
  violeta: { fondo: 'var(--color-chip-violeta)', tinta: 'var(--color-chip-violeta-tinta)' },
  turquesa: { fondo: 'var(--color-chip-turquesa)', tinta: 'var(--color-chip-turquesa-tinta)' },
  verde: { fondo: 'var(--color-chip-verde)', tinta: 'var(--color-chip-verde-tinta)' },
  lima: { fondo: 'var(--color-chip-lima)', tinta: 'var(--color-chip-lima-tinta)' },
} as const;

export type ColorDeChip = keyof typeof CHIPS;

/**
 * Un icono dentro de su pastel.
 *
 * El tamaño se elige por nombre y no se escribe en la llamada, por la misma
 * razón que en los botones: dos pasteles de medidas parecidas pero distintas
 * se leen como un descuido.
 */
export function ChipIcono({
  Icono,
  color,
  tamano = 'default',
  className,
}: {
  Icono: ComponentType<{
    className?: string;
    'aria-hidden'?: boolean;
    fill?: string;
    fillOpacity?: number;
    strokeWidth?: number;
  }>;
  color: ColorDeChip;
  /** `sm` para una fila de menú; `default` para una tarjeta. */
  tamano?: 'sm' | 'default';
  className?: string;
}) {
  const { fondo, tinta } = CHIPS[color];
  const pequeno = tamano === 'sm';

  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full',
        pequeno ? 'size-9' : 'size-11 sm:size-12',
        className,
      )}
      style={{ backgroundColor: fondo, color: tinta }}
    >
      <Icono
        className={pequeno ? 'size-4' : 'size-5'}
        fill="currentColor"
        fillOpacity={0.2}
        strokeWidth={1.9}
        aria-hidden
      />
    </span>
  );
}
