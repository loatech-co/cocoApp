import type { ComponentType } from 'react';

import { cn } from '@/shared/lib/utils';

/**
 * Los pasteles con los que la app marca sus cosas.
 *
 * ── Se nombran por su PAPEL, no por su color ────────────────────────────────
 * Eran `violeta`, `turquesa`, `verde` y `lima`, y ese nombre es exactamente lo
 * que obliga a renombrarlo todo cuando cambia el tema: el chip del gasto pasó
 * de violeta a pino y el nombre se volvió mentira. Con el papel en el nombre,
 * un tema nuevo cambia dos líneas en `index.css` y ni una llamada.
 *
 * Y viven aquí y no en cada pantalla porque el COLOR SIGNIFICA: el del gasto
 * es el mismo en el indicador de arriba y en el menú que lo registra.
 * Repetidos en dos sitios, un día alguien cambia uno y la misma cosa pasa a
 * tener dos colores según por dónde se entre.
 */
const CHIPS = {
  expense: { background: 'var(--chip-gasto)', ink: 'var(--chip-gasto-tinta)' },
  income: { background: 'var(--chip-ingreso)', ink: 'var(--chip-ingreso-tinta)' },
  budget: { background: 'var(--chip-presupuesto)', ink: 'var(--chip-presupuesto-tinta)' },
  transactions: { background: 'var(--chip-movimientos)', ink: 'var(--chip-movimientos-tinta)' },
} as const;

export type ChipColor = keyof typeof CHIPS;

/**
 * Un icono dentro de su pastel.
 *
 * El tamaño se elige por nombre y no se escribe en la llamada, por la misma
 * razón que en los botones: dos pasteles de medidas parecidas pero distintas
 * se leen como un descuido.
 */
export function IconChip({
  Icon,
  color,
  size = 'default',
  className,
}: {
  Icon: ComponentType<{
    className?: string;
    'aria-hidden'?: boolean;
    fill?: string;
    fillOpacity?: number;
    strokeWidth?: number;
  }>;
  color: ChipColor;
  /** `sm` para una fila de menú; `default` para una tarjeta. */
  size?: 'sm' | 'default';
  className?: string;
}) {
  const { background, ink } = CHIPS[color];
  const isSmall = size === 'sm';

  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full',
        isSmall ? 'size-9' : 'size-11 sm:size-12',
        className,
      )}
      style={{ backgroundColor: background, color: ink }}
    >
      <Icon
        className={isSmall ? 'size-4' : 'size-5'}
        fill="currentColor"
        fillOpacity={0.2}
        strokeWidth={1.9}
        aria-hidden
      />
    </span>
  );
}
