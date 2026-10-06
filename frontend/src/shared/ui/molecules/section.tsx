import type { ReactNode } from 'react';

import { cn } from '@/shared/lib/utils';
import { Block } from '@/shared/ui/atoms/block';

/**
 * Una parte de una ficha, con su nombre ENCIMA y no sobre el borde.
 *
 * Antes eran `<fieldset>` con `<legend>`, y un `legend` lo dibuja el navegador
 * montado sobre la línea del borde: el texto partía la caja por arriba y se
 * comía un trozo de lo primero que hubiera dentro. El nombre va fuera, que
 * además es lo que crea la jerarquía —etiqueta pequeña, contenido debajo—.
 */
export function Seccion({
  titulo,
  caja = true,
  crece = false,
  children,
}: {
  titulo: string;
  /** Con `false`, el contenido va suelto: lo que ya son tarjetas no necesita otra. */
  caja?: boolean;
  /**
   * Se come el alto que sobre en la ficha.
   *
   * La ficha tiene alto mínimo, así que con pocos campos sobra sitio, y el pie
   * se lo lleva al fondo con su `mt-auto`. Una sección que es el blanco de un
   * gesto —un cuadro donde se sueltan archivos— es la única a la que el tamaño
   * le sirve de algo, así que ese hueco es suyo.
   */
  crece?: boolean;
  children: ReactNode;
}) {
  return (
    // `gap-3` y no `gap-2`: con miniaturas debajo, dos píxeles menos hacían
    // que el rótulo pareciera pegado a la primera fila, casi montado encima
    // —que es justo lo que se arregló quitando los `legend`—.
    <section className={cn('flex flex-col gap-3', crece && 'min-h-0 flex-1')}>
      {/*
        Sin mayúsculas sostenidas.

        Una palabra en versalitas pierde la silueta que la hace reconocible
        —"Soporte" y "SOPORTE" no se leen igual de rápido— y dentro de una
        ficha, donde todo el texto es corto, ese rótulo gritando compite con lo
        que titula. El tamaño y el gris ya dicen que es un rótulo.
      */}
      <h3 className="text-xs font-semibold text-muted-foreground">{titulo}</h3>
      {caja ? <Block className="flex flex-col gap-3">{children}</Block> : children}
    </section>
  );
}
