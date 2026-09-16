import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

/**
 * Una superficie DENTRO de otra: un apartado de una ficha, una caja de
 * opciones, un aviso con su propio marco.
 *
 * ── Por qué se separa con BORDE y no con relleno ────────────────────────────
 * Porque el relleno no funciona en los dos temas a la vez, y no por descuido
 * del tema sino por cómo está hecho:
 *
 * · En claro, `card` y `popover` son los DOS blanco. Una tarjeta dentro de un
 *   modal es invisible: mismo color sobre mismo color.
 * · En oscuro, `muted` y `popover` se llevan un escalón de nada —#1a2826
 *   contra #142624—, así que el bloque se intuye pero no se lee.
 * · Y `card` es más OSCURO que `popover` en oscuro y más claro en claro, así
 *   que ni siquiera se puede confiar en el sentido del contraste.
 *
 * Un borde no depende de nada de eso: `--border` está calculado para verse
 * sobre cualquiera de las superficies del tema, en los dos modos. El relleno
 * se queda, pero como matiz y no como el que hace el trabajo.
 *
 * Es el mismo problema que ya resolvió la tarjeta del resumen a su manera
 * —sombra en vez de línea—; aquí no sirve la sombra, porque dentro de un modal
 * todo está a la misma altura.
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
export const BLOQUE = 'rounded-lg border border-border bg-muted/40 p-3';

export function Bloque({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn(BLOQUE, className)} {...props} />;
}
