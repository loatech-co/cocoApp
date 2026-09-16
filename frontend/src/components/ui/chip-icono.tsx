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
   * `cartel` es otra cosa: no marca, DECORA. Es el pastel a cinco veces su
   * tamaño, desfasado hacia la esquina superior izquierda de la tarjeta que lo
   * lleva y recortado por sus cantos. Ahí ya no dice «esto es un gasto» —eso
   * lo dice el texto de debajo— sino que le da cara a una tarjeta que de otro
   * modo sería un rectángulo con dos renglones dentro.
   */
  tamano?: 'sm' | 'default' | 'cartel';
  className?: string;
}) {
  const { fondo, tinta } = CHIPS[color];
  const cartel = tamano === 'cartel';

  const CAJA = {
    sm: 'size-9',
    default: 'size-11 sm:size-12',
    // Crece con la tarjeta: apilada en un teléfono ocupa un tercio de la
    // ficha, así que el círculo no puede medir lo mismo que en una columna
    // de quinientos de alto.
    cartel: 'size-52 sm:size-64',
  } as const;

  const GLIFO = {
    sm: 'size-4',
    default: 'size-5',
    /*
      ── Por qué el glifo del cartel va al 40 % ────────────────────────────
      A este tamaño el dibujo deja de ser un icono y pasa a ser una figura de
      cien píxeles en la esquina de la tarjeta. A plena tinta compite con el
      título que hay debajo —y el título es lo que hay que leer—, así que se
      queda como una marca de agua: se reconoce la forma, no se lee.

      Los otros dos tamaños NO lo llevan: ahí el pastel sí etiqueta, y un
      icono de 16 al 40 % no se distingue.
    */
    /*
      El glifo va a un tercio del círculo, no a llenarlo.

      Estuvo a la mitad, y a esa escala el dibujo y el disco se estorban: la
      figura toca el borde por los cuatro lados y lo que se ve es una mancha
      con muescas, no una cámara ni un lápiz. Con aire alrededor, la silueta
      se recorta contra el pastel y se reconoce de un vistazo, que es lo único
      que este dibujo tiene que hacer.
    */
    cartel: 'size-16 opacity-40 sm:size-20',
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
      {/*
        ── El cartel va SIN relleno: solo el trazo ──────────────────────────
        Los otros dos tamaños pintan el interior del glifo con su propia tinta
        al 20 %, y a 16 o 20 píxeles eso es lo que le da cuerpo a un dibujo que
        si no sería un alambre.

        A cien píxeles pasa lo contrario: ese 20 % es una mancha de la mitad
        del círculo, y el dibujo deja de reconocerse por su forma —que es todo
        lo que tiene que hacer aquí— para convertirse en un borrón. Sin
        relleno, lo que queda es la línea, que a ese tamaño se lee sola.
      */}
      <Icono
        className={GLIFO[tamano]}
        fill={cartel ? 'none' : 'currentColor'}
        fillOpacity={cartel ? undefined : 0.2}
        strokeWidth={1.9}
        aria-hidden
      />
    </span>
  );
}
