import { Check, Minus } from 'lucide-react';
import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

/**
 * Una casilla de verificación.
 *
 * ── Por qué no es el `<input type="checkbox">` a secas ──────────────────────
 * Porque el nativo se pinta con los colores del sistema operativo y no con los
 * del producto: en modo oscuro aparece un cuadro blanco de Windows en medio de
 * un menú verde. El input sigue ahí —invisible pero presente— para que el
 * teclado, el foco y los lectores de pantalla funcionen igual que siempre; lo
 * que se ve es el recuadro de al lado.
 *
 * `indeterminado` es para un padre con solo algunos hijos marcados: decir "sí"
 * cuando faltan la mitad es mentir, y decir "no" también.
 */
export function Casilla({
  className,
  indeterminado = false,
  ...props
}: ComponentProps<'input'> & { indeterminado?: boolean }) {
  return (
    <span className="relative inline-grid size-4 shrink-0 place-items-center">
      <input
        type="checkbox"
        className="peer absolute inset-0 cursor-pointer opacity-0"
        {...props}
      />
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none grid size-4 place-items-center rounded-[5px] border transition-colors',
          'border-input bg-card text-primary-foreground',
          'peer-checked:border-primary peer-checked:bg-primary peer-checked:[&>svg]:opacity-100',
          'peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-1 peer-focus-visible:ring-offset-background',
          'peer-disabled:opacity-40',
          indeterminado && 'border-primary bg-primary',
          className,
        )}
      >
        {indeterminado ? (
          <Minus className="size-3" strokeWidth={3} />
        ) : (
          <Check className="size-3 opacity-0 transition-opacity" strokeWidth={3} />
        )}
      </span>
    </span>
  );
}
