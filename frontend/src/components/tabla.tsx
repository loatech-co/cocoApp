import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react';
import type { ReactNode } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * Las piezas de una tabla de datos.
 *
 * ── Por qué son piezas sueltas y no una `<Tabla columnas={…} filas={…} />` ──
 * Porque cada columna de esta app hace algo distinto: una edita en sitio, otra
 * formatea plata, otra abre un modal. Una tabla "genérica" acabaría recibiendo
 * una función de render por columna, que es exactamente escribir la celda a
 * mano pero con una capa de indirección encima.
 *
 * Lo que sí se comparte es lo que siempre se hace mal: el desplazamiento
 * horizontal, la primera columna fija y el pie con los totales.
 */
export function Tabla({ children, className }: { children: ReactNode; className?: string }) {
  return (
    // Sin borde, como la tarjeta y por lo mismo: la tabla es material apoyado
    // en el pozo, y el escalón de superficie ya dice dónde empieza. Una línea
    // alrededor de una tabla que ADEMÁS lleva líneas entre sus filas son dos
    // retículas superpuestas.
    <div className="overflow-x-auto overscroll-x-contain rounded-lg bg-card">
      {/*
        `min-w` fuerza el desplazamiento en vez de apretar las columnas hasta
        que el texto se parte en cuatro líneas. Con la primera columna fija, se
        arrastra a los lados sin perder de vista de qué fila es cada número.
      */}
      <table className={cn('w-full min-w-[48rem] border-collapse text-sm', className)}>
        {children}
      </table>
    </div>
  );
}

/**
 * Una cabecera de columna.
 *
 * Cuando ordena, la flecha va SIEMPRE visible aunque esté apagada: si solo
 * apareciera en la columna activa, no habría forma de saber que las demás
 * también se pueden ordenar sin ir probando una por una.
 */
export function Th({
  children,
  alineado = 'izquierda',
  fija = false,
  divisor = true,
  orden,
  className,
}: {
  children: ReactNode;
  alineado?: 'izquierda' | 'derecha';
  /** La primera columna, la que no se va al hacer scroll. */
  fija?: boolean;
  /**
   * La línea que separa la columna fija de las que se desplazan.
   *
   * Ayuda cuando hay tantas columnas que uno se pierde de qué fila está
   * leyendo. Con seis columnas que caben casi enteras, es una raya de más.
   */
  divisor?: boolean;
  orden?: { activo: 'asc' | 'desc' | null; onCambiar: () => void } | undefined;
  className?: string;
}) {
  const Flecha =
    orden?.activo === 'asc' ? ChevronUp : orden?.activo === 'desc' ? ChevronDown : ChevronsUpDown;

  const contenido = orden ? (
    <button
      type="button"
      onClick={orden.onCambiar}
      className={cn(
        'inline-flex items-center gap-1 rounded-sm transition-colors hover:text-foreground',
        alineado === 'derecha' && 'flex-row-reverse',
        orden.activo && 'text-foreground',
      )}
    >
      {children}
      <Flecha
        className={cn('size-3.5 shrink-0', !orden.activo && 'opacity-40')}
        aria-hidden="true"
      />
    </button>
  ) : (
    children
  );

  return (
    <th
      scope="col"
      aria-sort={
        orden?.activo === 'asc' ? 'ascending' : orden?.activo === 'desc' ? 'descending' : undefined
      }
      className={cn(
        'whitespace-nowrap border-b border-border px-4 py-3 text-xs font-semibold text-muted-foreground',
        alineado === 'derecha' ? 'text-right' : 'text-left',
        fija && 'sticky left-0 z-10 bg-card',
        fija && divisor && 'border-r',
        className,
      )}
    >
      {contenido}
    </th>
  );
}

export function Tr({
  children,
  onClick,
  atencion = false,
  atenuada = false,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  /** La fila pide algo: un movimiento sin clasificar, por ejemplo. */
  atencion?: boolean;
  atenuada?: boolean;
  className?: string;
}) {
  return (
    <tr
      onClick={onClick}
      className={cn(
        // `group/fila` deja que la celda FIJA sepa que su fila está bajo el
        // cursor: esa celda necesita fondo propio y opaco para que las columnas
        // no se transparenten al desplazarse, y ese fondo opaco tapaba el
        // resaltado de la fila. Se marcaba todo menos la primera columna.
        'group/fila border-b border-border transition-colors last:border-b-0',
        // Ámbar y no rojo: sin clasificar no es un error, es algo pendiente. En
        // esta paleta el rojo está reservado a lo que de verdad salió mal.
        atencion ? 'bg-warning-surface/40 hover:bg-warning-surface/60' : 'hover:bg-muted/60',
        atenuada && 'opacity-50',
        onClick && 'cursor-pointer',
        className,
      )}
    >
      {children}
    </tr>
  );
}

export function Td({
  children = null,
  alineado = 'izquierda',
  fija = false,
  divisor = true,
  atencion = false,
  className,
}: {
  children?: ReactNode;
  alineado?: 'izquierda' | 'derecha';
  fija?: boolean;
  /** Ver `Th`. */
  divisor?: boolean;
  /** Hereda el tinte de la fila: una celda fija sobre fondo propio lo taparía. */
  atencion?: boolean;
  className?: string;
}) {
  return (
    <td
      className={cn(
        'px-4 py-3',
        alineado === 'derecha' ? 'text-right' : 'text-left',
        // La celda fija necesita fondo PROPIO y opaco, o las columnas de atrás
        // se transparentarían por debajo al desplazarse. Como es opaco, tiene
        // que repetir a mano el resaltado de su fila: `color-mix` reproduce
        // exactamente lo que el navegador compone en las demás celdas.
        fija && 'sticky left-0 z-10 transition-colors',
        fija && divisor && 'border-r border-border',
        fija &&
          (atencion
            ? 'bg-[color-mix(in_srgb,var(--warning-surface)_40%,var(--card))] group-hover/fila:bg-[color-mix(in_srgb,var(--warning-surface)_60%,var(--card))]'
            : 'bg-card group-hover/fila:bg-[color-mix(in_srgb,var(--muted)_60%,var(--card))]'),
        className,
      )}
    >
      {children}
    </td>
  );
}

/**
 * El pie con los totales.
 *
 * Va dentro de la tabla y no debajo a propósito: así se desplaza con las
 * columnas y cada total queda bajo la suya. Un pie fuera de la tabla obliga a
 * repetir los anchos a mano y se desalinea al primer cambio.
 */
export function TablaPie({ children }: { children: ReactNode }) {
  return <tfoot className="border-t-2 border-border bg-muted/40 font-medium">{children}</tfoot>;
}

/**
 * La tabla mientras llega su dato.
 *
 * Con el MISMO número de columnas y el mismo alto de fila que la de verdad:
 * un esqueleto de otra forma es un cambio de página, no una espera, y la vista
 * salta cuando llegan los datos.
 */
export function TablaEsqueleto({
  columnas,
  filas = 8,
  divisor = true,
}: {
  columnas: string[];
  filas?: number;
  divisor?: boolean;
}) {
  return (
    <Tabla>
      <thead>
        <tr>
          {columnas.map((nombre, i) => (
            <Th
              key={nombre}
              fija={i === 0}
              divisor={divisor}
              alineado={i === columnas.length - 1 ? 'derecha' : 'izquierda'}
            >
              {nombre}
            </Th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: filas }, (_, fila) => (
          <tr key={fila} className="border-b border-border last:border-b-0">
            {columnas.map((nombre, i) => (
              <Td key={nombre} fija={i === 0} divisor={divisor}>
                <Skeleton className={cn('h-4', i === 0 ? 'w-40' : 'w-20')} />
              </Td>
            ))}
          </tr>
        ))}
      </tbody>
    </Tabla>
  );
}
