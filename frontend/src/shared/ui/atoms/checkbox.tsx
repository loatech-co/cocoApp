import { Check, Minus } from 'lucide-react';
import type { ComponentProps } from 'react';

import { cn } from '@/shared/lib/utils';

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
export function Checkbox({
  className,
  isIndeterminate = false,
  ...props
}: ComponentProps<'input'> & { isIndeterminate?: boolean }) {
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
          // `rounded-sm` es `--radius` menos 4, o sea 6px: sale de la escala
          // del tema. Era un `rounded-[5px]` a mano, de cuando la escala
          // estaba corrida y ningún nombre daba un valor bajo.
          'pointer-events-none grid size-4 place-items-center rounded-sm border transition-colors',
          'border-input bg-card text-primary-foreground',
          // Se tiñe el borde al pasar por encima, igual que un campo: la
          // casilla es el control más pequeño de la app y sin esto no hay
          // forma de saber que se puede pulsar hasta que se pulsa.
          'peer-hover:border-ring/50',
          'peer-checked:border-primary peer-checked:bg-primary peer-checked:[&>svg]:opacity-100',
          'peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-1 peer-focus-visible:ring-offset-background',
          'peer-disabled:opacity-40',
          isIndeterminate && 'border-primary bg-primary',
          className,
        )}
      >
        {isIndeterminate ? (
          <Minus className="size-3" strokeWidth={3} />
        ) : (
          <Check className="size-3 opacity-0 transition-opacity" strokeWidth={3} />
        )}
      </span>
    </span>
  );
}
