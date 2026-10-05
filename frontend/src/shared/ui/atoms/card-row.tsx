import type { ComponentProps } from 'react';

import { cn } from '@/shared/lib/utils';
import { REALCE } from '@/shared/ui/foundations/superficie';

/**
 * Una fila de una lista DENTRO de una tarjeta, que se puede pulsar: un pago
 * pendiente. En columna, para que lo que vaya debajo —un progreso— se apile.
 *
 * El resaltado es un FONDO, no una bajada de opacidad: atenuar el texto al
 * pasar por encima es lo que hace un control apagado, y la fila que sí se
 * puede pulsar parecía la que no. Y no se sale de la tarjeta: ocupa el ancho
 * de la columna, alineado con el título, con 12px de aire a cada lado.
 *
 * El realce es el acento como TINTA (`REALCE`), no la superficie de acento:
 * sobre una tarjeta que ya es tenue, `accent` apenas distinguía la fila
 * señalada de sus vecinas.
 *
 * Sin `onClick` la fila se queda quieta: ni realce ni mano.
 */
export function CardRow({
  onClick,
  ...props
}: Omit<ComponentProps<'button'>, 'className' | 'type' | 'disabled'>) {
  return (
    <button
      type="button"
      disabled={!onClick}
      onClick={onClick}
      className={cn(
        'flex w-full flex-col gap-2 rounded-md px-3 py-2.5 text-left transition-colors',
        onClick ? cn('cursor-pointer', REALCE) : 'cursor-default',
      )}
      {...props}
    />
  );
}
