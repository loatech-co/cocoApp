import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/button';

/**
 * Paginador. Uno solo para toda la app.
 *
 * Existe como componente y no suelto en cada pantalla porque las reglas de
 * borde —deshabilitar en los extremos, no mostrarse con una sola página,
 * decir en qué página se está— se olvidan la mitad de las veces si hay que
 * reescribirlas. Con uno compartido, corregirlo una vez lo corrige en todas.
 */
export function Paginador({
  pagina,
  total,
  porPagina,
  onCambiar,
}: {
  pagina: number;
  /** Total de FILAS, no de páginas: es lo que devuelve la API. */
  total: number;
  porPagina: number;
  onCambiar: (pagina: number) => void;
}) {
  const paginas = Math.max(1, Math.ceil(total / porPagina));

  // Con una sola página no hay nada que paginar, y mostrar dos botones muertos
  // solo añade ruido.
  if (paginas <= 1) return null;

  const desde = (pagina - 1) * porPagina + 1;
  const hasta = Math.min(pagina * porPagina, total);

  return (
    <nav
      className="flex flex-wrap items-center justify-between gap-3"
      aria-label="Paginación"
    >
      {/* Cuántas filas se están viendo, no solo el número de página: "51 a 100
          de 377" dice dónde está uno; "página 2 de 8" obliga a calcularlo. */}
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {desde} a {hasta} de {total}
      </p>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pagina <= 1}
          onClick={() => onCambiar(pagina - 1)}
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          <span className="hidden sm:inline">Anterior</span>
        </Button>

        <span className="px-1 text-sm tabular text-muted-foreground">
          {pagina} / {paginas}
        </span>

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pagina >= paginas}
          onClick={() => onCambiar(pagina + 1)}
        >
          <span className="hidden sm:inline">Siguiente</span>
          <ChevronRight className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}
