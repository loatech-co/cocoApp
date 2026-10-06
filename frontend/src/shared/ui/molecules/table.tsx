import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/shared/lib/utils';
import { Skeleton } from '@/shared/ui/atoms/skeleton';

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
export function Table({ children, className }: { children: ReactNode; className?: string }) {
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
  align = 'left',
  isSticky = false,
  hasDivider = true,
  sort,
  className,
}: {
  children: ReactNode;
  align?: 'left' | 'right';
  /** La primera columna, la que no se va al hacer scroll. */
  isSticky?: boolean;
  /**
   * La línea que separa la columna fija de las que se desplazan.
   *
   * Ayuda cuando hay tantas columnas que uno se pierde de qué fila está
   * leyendo. Con seis columnas que caben casi enteras, es una raya de más.
   */
  hasDivider?: boolean;
  sort?: { direction: 'asc' | 'desc' | null; onChange: () => void } | undefined;
  className?: string;
}) {
  const content = sort ? (
    <SortButton sort={sort} align={align}>
      {children}
    </SortButton>
  ) : (
    children
  );

  return (
    <th
      scope="col"
      aria-sort={
        sort?.direction === 'asc'
          ? 'ascending'
          : sort?.direction === 'desc'
            ? 'descending'
            : undefined
      }
      className={cn(
        'whitespace-nowrap border-b border-border px-4 py-3 text-xs font-semibold text-muted-foreground',
        align === 'right' ? 'text-right' : 'text-left',
        isSticky && 'sticky left-0 z-10 bg-card',
        isSticky && hasDivider && 'border-r',
        className,
      )}
    >
      {content}
    </th>
  );
}

export function Tr({
  children,
  onClick,
  isFlagged = false,
  isDimmed = false,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  /** La fila pide algo: un movimiento sin clasificar, por ejemplo. */
  isFlagged?: boolean;
  isDimmed?: boolean;
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
        isFlagged ? 'bg-warning-surface/40 hover:bg-warning-surface/60' : 'hover:bg-muted/60',
        isDimmed && 'opacity-50',
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
  align = 'left',
  isSticky = false,
  hasDivider = true,
  isFlagged = false,
  className,
}: {
  children?: ReactNode;
  align?: 'left' | 'right';
  isSticky?: boolean;
  /** Ver `Th`. */
  hasDivider?: boolean;
  /** Hereda el tinte de la fila: una celda fija sobre fondo propio lo taparía. */
  isFlagged?: boolean;
  className?: string;
}) {
  return (
    <td
      className={cn(
        'px-4 py-3',
        align === 'right' ? 'text-right' : 'text-left',
        // La celda fija necesita fondo PROPIO y opaco, o las columnas de atrás
        // se transparentarían por debajo al desplazarse. Como es opaco, tiene
        // que repetir a mano el resaltado de su fila: `color-mix` reproduce
        // exactamente lo que el navegador compone en las demás celdas.
        isSticky && 'sticky left-0 z-10 transition-colors',
        isSticky && hasDivider && 'border-r border-border',
        isSticky &&
          (isFlagged
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
export function TableFooter({ children }: { children: ReactNode }) {
  return <tfoot className="border-t-2 border-border bg-muted/40 font-medium">{children}</tfoot>;
}

/**
 * La tabla mientras llega su dato.
 *
 * Con el MISMO número de columnas y el mismo alto de fila que la de verdad:
 * un esqueleto de otra forma es un cambio de página, no una espera, y la vista
 * salta cuando llegan los datos.
 */
export function TableSkeleton({
  columns,
  rows = 8,
  hasDivider = true,
}: {
  columns: string[];
  rows?: number;
  hasDivider?: boolean;
}) {
  return (
    <Table>
      <thead>
        <tr>
          {columns.map((name, i) => (
            <Th
              key={name}
              isSticky={i === 0}
              hasDivider={hasDivider}
              align={i === columns.length - 1 ? 'right' : 'left'}
            >
              {name}
            </Th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rows }, (_, row) => (
          <tr key={row} className="border-b border-border last:border-b-0">
            {columns.map((name, i) => (
              <Td key={name} isSticky={i === 0} hasDivider={hasDivider}>
                <Skeleton className={cn('h-4', i === 0 ? 'w-40' : 'w-20')} />
              </Td>
            ))}
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
/** El botón que ordena una columna, con su flecha siempre visible. */
function SortButton({
  sort,
  align,
  children,
}: {
  sort: { direction: 'asc' | 'desc' | null; onChange: () => void };
  align: 'left' | 'right';
  children: ReactNode;
}) {
  const Arrow =
    sort.direction === 'asc' ? ChevronUp : sort.direction === 'desc' ? ChevronDown : ChevronsUpDown;

  return (
    <button
      type="button"
      onClick={sort.onChange}
      className={cn(
        'inline-flex items-center gap-1 rounded-sm transition-colors hover:text-foreground',
        align === 'right' && 'flex-row-reverse',
        sort.direction && 'text-foreground',
      )}
    >
      {children}
      <Arrow
        className={cn('size-3.5 shrink-0', !sort.direction && 'opacity-40')}
        aria-hidden="true"
      />
    </button>
  );
}
