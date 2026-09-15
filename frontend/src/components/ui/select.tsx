import { ChevronDown } from 'lucide-react';
import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

/**
 * Una lista desplegable.
 *
 * ── Por qué no es el `<select>` a secas ─────────────────────────────────────
 * Porque su flecha la dibuja el SISTEMA OPERATIVO, pegada al borde derecho y
 * con el color y el tamaño que le dé la gana a cada máquina: en Windows es un
 * triángulo negro tocando la línea del campo, en macOS son dos puntas. Se
 * apaga con `appearance-none` y se dibuja la nuestra, con sitio propio.
 *
 * El `<select>` de debajo sigue siendo el nativo, y eso es deliberado: su lista
 * la pinta el sistema, y en un teléfono eso significa la rueda de iOS o el
 * diálogo de Android, que son mejores que cualquier cosa que se pueda escribir
 * a mano y ya saben buscar escribiendo.
 *
 * ── Por qué el relleno de la derecha es mayor que el de la izquierda ────────
 * Porque ahí vive la flecha. Con el mismo relleno en los dos lados, una opción
 * larga pasa por debajo del icono y las dos cosas se leen encima.
 */
export function Select({
  className,
  tamano = 'default',
  children,
  ...props
}: ComponentProps<'select'> & { tamano?: 'default' | 'sm' }) {
  const pequeno = tamano === 'sm';

  return (
    <span className="relative inline-flex min-w-0 w-full items-center">
      <select
        className={cn(
          'w-full min-w-0 appearance-none truncate rounded-lg border bg-card transition-colors',
          'outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring',
          'disabled:cursor-not-allowed disabled:opacity-50',
          pequeno ? 'h-8 pl-2.5 pr-8 text-xs' : 'h-10 pl-3 pr-9 text-sm',
          className,
        )}
        style={{ borderColor: 'var(--input)' }}
        {...props}
      >
        {children}
      </select>

      <ChevronDown
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute opacity-60',
          // Separada del borde: pegada a la línea parece montada encima.
          pequeno ? 'right-2.5 size-3.5' : 'right-3 size-4',
        )}
      />
    </span>
  );
}
