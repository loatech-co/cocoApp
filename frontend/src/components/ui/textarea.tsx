import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';
import { useDentroDeUnCampo } from '@/components/ui/campo';

/**
 * Un campo de varias líneas.
 *
 * ── Por qué existe ──────────────────────────────────────────────────────────
 * Había uno solo en toda la app —las notas de un movimiento— y estaba escrito
 * a mano: `rounded-lg border bg-card px-3 py-2 text-sm` con el color del borde
 * puesto por un `style` en línea. Le faltaba todo lo demás. Sin anillo de
 * foco, quien navega con el tabulador no sabía nunca dónde estaba; sin color
 * de marcador, su texto salía del mismo tono que lo escrito; sin estado
 * apagado ni inválido, un formulario que no se pudo enviar no podía señalarlo.
 *
 * Y sin nada de eso en común con el `Input` que tiene justo encima: dos campos
 * pegados, uno que se ilumina al enfocarse y otro que no.
 *
 * ── Qué comparte con el campo de una línea ──────────────────────────────────
 * Todo menos el alto: el mismo borde, el mismo radio, el mismo anillo de 1px,
 * la misma respuesta al cursor y el mismo tamaño de letra —16px por debajo del
 * corte para que Safari no amplíe la página al enfocarlo, 14 por encima—.
 *
 * El alto lo da `rows`, que es del propio elemento, y `min-h-0` no aplica
 * aquí: un área de texto que se pueda encoger por debajo de sus filas deja de
 * mostrar lo que se está escribiendo.
 */
export function Textarea({ className, placeholder, ...props }: ComponentProps<'textarea'>) {
  // Dentro de un `Campo`, la primera línea baja para dejarle sitio a la
  // etiqueta; fuera, el relleno es simétrico.
  const enCampo = useDentroDeUnCampo();

  return (
    <textarea
      // Siempre un marcador, aunque sea un espacio: es lo que hace que
      // `:placeholder-shown` funcione, y de ahí sale el estado que sube la
      // etiqueta flotante.
      placeholder={placeholder ?? ' '}
      className={cn(
        'flex w-full rounded-lg border border-input bg-card px-3 py-2 text-base',
        enCampo && 'pb-2 pt-6',
        'placeholder:text-muted-foreground',
        'transition-colors hover:border-ring/40',
        'outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'aria-invalid:border-destructive aria-invalid:focus-visible:ring-destructive',
        'escritorio:text-sm',
        className,
      )}
      {...props}
    />
  );
}
