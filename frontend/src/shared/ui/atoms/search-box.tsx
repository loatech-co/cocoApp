import { Search } from 'lucide-react';
import type { ComponentProps } from 'react';

import { cn } from '@/shared/lib/utils';

/**
 * La caja de filtrar una lista que ya está a la vista: una lupa y el texto.
 *
 * No es un `Input`. Un campo de formulario guarda un dato y lleva su etiqueta
 * flotante y su anillo; esto solo estrecha lo que hay debajo, y se lee como
 * parte de la lista y no como un campo más de la ficha.
 *
 * | Forma      | Dónde                                                        |
 * | ---------- | ------------------------------------------------------------ |
 * | `cabecera` | Arriba de un desplegable, separada de la lista por una raya  |
 * | `caja`     | Dentro de un bloque, sobre una rejilla: la de los iconos     |
 */
const SHAPES = {
  header: { box: 'border-b border-border px-3 py-2', field: '' },
  box: { box: 'rounded-md border border-input bg-card px-3', field: 'h-9' },
} as const;

export function SearchBox({
  shape,
  ...props
}: Omit<ComponentProps<'input'>, 'className' | 'type'> & { shape: keyof typeof SHAPES }) {
  return (
    <div className={cn('flex items-center gap-2', SHAPES[shape].box)}>
      <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <input
        className={cn(
          'min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground',
          SHAPES[shape].field,
        )}
        {...props}
      />
    </div>
  );
}
