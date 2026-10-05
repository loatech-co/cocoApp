import type { ComponentProps } from 'react';
import { Link } from 'react-router-dom';

/**
 * Un enlace dentro de una frase: «¿No tienes cuenta? Solicitar acceso».
 *
 * Va SUBRAYADO en reposo, no solo al pasar por encima. Dentro de un texto lo
 * único que lo separaba de la frase era el color, y el primario contra el gris
 * de la frase da 1,95:1 —por debajo de los 3:1 que pide WCAG 1.4.1—; en un
 * teléfono, donde no hay «por encima», no se sabía que se podía pulsar.
 *
 * Sin `className`: lo que haga falta distinto es una variante aquí.
 */
export function TextLink(props: Omit<ComponentProps<typeof Link>, 'className'>) {
  return (
    <Link className="text-primary underline underline-offset-4 hover:decoration-2" {...props} />
  );
}
