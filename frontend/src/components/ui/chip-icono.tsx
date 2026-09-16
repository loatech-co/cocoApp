import type { ComponentType } from 'react';

import { cn } from '@/lib/utils';

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
export const CHIPS = {
  gasto: { fondo: 'var(--chip-gasto)', tinta: 'var(--chip-gasto-tinta)' },
  ingreso: { fondo: 'var(--chip-ingreso)', tinta: 'var(--chip-ingreso-tinta)' },
  presupuesto: { fondo: 'var(--chip-presupuesto)', tinta: 'var(--chip-presupuesto-tinta)' },
  movimientos: { fondo: 'var(--chip-movimientos)', tinta: 'var(--chip-movimientos-tinta)' },
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
  /**
   * `sm` para una fila de menú; `default` para una tarjeta.
   *
   * `cartel` es otra cosa: no marca, DECORA. Es el pastel a cuatro veces su
   * tamaño, pensado para desbordar la esquina de la tarjeta que lo lleva y
   * quedar recortado por ella. Ahí ya no dice «esto es un gasto» —eso lo dice
   * el texto de debajo— sino que le da cara a una tarjeta que de otro modo
   * sería un rectángulo con dos renglones dentro.
   */
  tamano?: 'sm' | 'default' | 'cartel';
  className?: string;
}) {
  const { fondo, tinta } = CHIPS[color];

  const CAJA = {
    sm: 'size-9',
    default: 'size-11 sm:size-12',
    // Crece con la tarjeta: apilada en un teléfono mide un tercio de la
    // pantalla y un círculo de 160 se la comería entera.
    cartel: 'size-32 sm:size-40',
  } as const;

  const GLIFO = {
    sm: 'size-4',
    default: 'size-5',
    cartel: 'size-12 sm:size-16',
  } as const;

  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full',
        CAJA[tamano],
        className,
      )}
      style={{ backgroundColor: fondo, color: tinta }}
    >
      <Icono
        className={GLIFO[tamano]}
        fill="currentColor"
        fillOpacity={0.2}
        strokeWidth={1.9}
        aria-hidden
      />
    </span>
  );
}
