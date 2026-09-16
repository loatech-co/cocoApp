import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/**
 * Un campo de texto.
 *
 * ── Los mismos DOS tamaños que el botón ─────────────────────────────────────
 * `sm` mide 36 y `md` mide 44, y son los mismos dos de `button.tsx`, del
 * `Select`, del `Combo` y del selector de fecha. Una fila donde el botón mide
 * 44, el campo 40 y el desplegable 36 se ve temblorosa aunque nadie sepa
 * señalar por qué.
 *
 * Estaba clavado en 44 sin alternativa, así que quien necesitaba uno compacto
 * —la barra de filtros, una celda de tabla— lo escribía con un `className`, y
 * con el alto se colaba un radio distinto.
 */
export function Input({
  className,
  type,
  tamano = 'md',
  ...props
}: ComponentProps<'input'> & { tamano?: 'sm' | 'md' }) {
  return (
    <input
      type={type}
      className={cn(
        'flex w-full rounded-lg border border-input bg-card px-3',
        tamano === 'sm' ? 'h-9 text-sm' : 'h-11 text-base',
        // El suelo táctil, aunque en `md` sobre: 44 ya pasa de 42. Se declara
        // igual porque `piso-tactil.test.ts` pide que quien dibuja un control
        // lo diga, y el día que alguien baje este alto el suelo sigue puesto.
        'movil:min-h-[42px]',
        'placeholder:text-muted-foreground',
        // Al pasar por encima se tiñe el BORDE, igual que el `Select` y el
        // `Combo` que lleva al lado. Sin esto, en una misma fila un control
        // respondía al ratón y el de al lado no, y parecía que uno estaba
        // apagado.
        'transition-colors hover:border-ring/40',
        // Un anillo de 1px y el borde teñido. Con 2px el campo parecía crecer
        // al recibir el foco y el halo se comía la separación con el de al lado.
        'outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'aria-invalid:border-destructive aria-invalid:focus-visible:ring-destructive',
        // 16px por debajo del corte y 14 por encima, y el corte es el de la
        // app —no el `md:` de Tailwind, que mide solo el ancho—: una tableta
        // en vertical es táctil aunque mida 800, y Safari amplía la página
        // entera al enfocar un campo de menos de 16px.
        tamano === 'md' && 'escritorio:text-sm',
        className,
      )}
      {...props}
    />
  );
}
