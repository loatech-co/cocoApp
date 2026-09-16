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
      ── El glifo del cartel es MÁS GRANDE que su disco ────────────────────
      Un cuarto más, y se sale por los cuatro lados. Es lo contrario de lo que
      hace un pastel normal —ahí el disco contiene al dibujo y lo enmarca— y
      es a propósito: aquí el disco ya no es el marco del icono, es una mancha
      de color detrás de él.

      Las dos alternativas no funcionaban. Con el glifo a la mitad del disco,
      la figura toca el borde por los cuatro lados y lo que se ve es una
      mancha con muescas. Con el glifo a un tercio, vuelve a ser un icono
      centrado en un círculo, que es exactamente lo que este tamaño existe
      para no ser.

      Saliéndose, las dos formas se leen por separado: el círculo como color y
      la línea como dibujo. Cabe porque el `<span>` no recorta —el que recorta
      es la tarjeta, contra su propio canto— y porque el glifo va sin relleno,
      así que lo que se sale es trazo y no una masa de color.
    */
    // `shrink-0` no es adorno: un hijo de una caja flexible más ancho que
    // ella se encoge hasta caber, así que sin esto el glifo se quedaría
    // exactamente del tamaño del disco y no se saldría nunca.
    cartel: 'size-64 shrink-0 opacity-40 sm:size-80',
  } as const;

  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full',
        // El cartel deja que su glifo se salga; los otros dos no tienen nada
        // que sacar, así que la declaración sobra y no se escribe.
        cartel && 'overflow-visible',
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
