import type { ComponentProps } from 'react';

import { cn } from '@/shared/lib/utils';

/**
 * Una superficie DENTRO de otra: un apartado de una ficha, una caja de
 * opciones, un aviso con su propio marco.
 *
 * ── Por qué se separa con RELLENO y no con borde ────────────────────────────
 * Llevó borde mientras el relleno no funcionaba: `card` y `popover` eran los
 * dos blanco en claro, y en oscuro `muted` y `popover` se llevaban un escalón
 * de nada. Un bloque relleno dentro de un modal era invisible, así que lo que
 * hacía el trabajo era la línea.
 *
 * Con tres superficies eso se acabó. `--muted` es LO ELEGIDO y está a un
 * escalón de verdad del material en los dos temas, y el escalón va en el
 * sentido que toca en cada uno: en claro hacia abajo —un bloque es un hueco
 * en la tarjeta, como el pozo lo es en la página— y en oscuro hacia arriba,
 * porque ahí lo que está más cerca es lo más claro.
 *
 * Y va a plena opacidad, no al 40 %: un relleno al 40 % sobre una superficie
 * que casi no contrasta es la mitad de casi nada, que es justo por lo que
 * antes hacía falta la línea.
 */
/**
 * La clase, para lo que no es un `<div>`.
 *
 * Un bloque puede ser una etiqueta que envuelve un interruptor o un botón
 * entero; ninguno de los dos puede ser un `<div>` sin perder lo que es. Esos
 * usan la clase y siguen siendo un solo sitio donde cambia el aspecto.
 *
 * Seis sitios lo escribían a mano con CUATRO rellenos distintos —30, 40 y 60
 * por ciento— y dos radios, que es exactamente cómo se ve que nadie lo
 * decidió: se escribió seis veces y salieron seis.
 */
export const BLOCK = 'rounded-lg bg-muted p-3';

export function Block({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn(BLOCK, className)} {...props} />;
}
