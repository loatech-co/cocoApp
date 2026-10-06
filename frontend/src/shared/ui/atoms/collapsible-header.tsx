import { ChevronDown, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * La cabecera de una tarjeta que se pliega: un galón y lo que la nombra.
 *
 * El galón mira a la derecha cerrada y abajo abierta, y la cabecera ENTERA es
 * el control —no solo el galón—, con `aria-expanded`. Ocupa el ancho que
 * deje libre lo que vaya a su lado (un menú de la tarjeta, por ejemplo).
 *
 * `p-3 sm:p-4` y no `p-4 sm:p-6`: veinticuatro píxeles por encima de un título
 * de 18 son más aire que letra, y una cabecera no es el contenido de la
 * tarjeta —lo que se viene a leer está debajo—.
 */
export function CollapsibleHeader({
  isOpen,
  onToggle,
  children,
}: {
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const Chevron = isOpen ? ChevronDown : ChevronRight;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={isOpen}
      className="flex min-w-0 flex-1 items-center gap-3 p-3 text-left sm:p-4"
    >
      <Chevron className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      {children}
    </button>
  );
}
