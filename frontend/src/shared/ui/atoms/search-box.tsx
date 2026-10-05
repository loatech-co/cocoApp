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
const FORMAS = {
  cabecera: { caja: 'border-b border-border px-3 py-2', campo: '' },
  caja: { caja: 'rounded-md border border-input bg-card px-3', campo: 'h-9' },
} as const;

export function SearchBox({
  forma,
  ...props
}: Omit<ComponentProps<'input'>, 'className' | 'type'> & { forma: keyof typeof FORMAS }) {
  return (
    <div className={cn('flex items-center gap-2', FORMAS[forma].caja)}>
      <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <input
        className={cn(
          'min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground',
          FORMAS[forma].campo,
        )}
        {...props}
      />
    </div>
  );
}
