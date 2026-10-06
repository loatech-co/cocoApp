import type { ComponentProps } from 'react';
import { Link } from 'react-router-dom';

/**
 * A link inside a sentence: «¿No tienes cuenta? Solicitar acceso».
 *
 * It is UNDERLINED at rest, not only on hover. Inside a text the
 * only thing separating it from the sentence was the color, and the primary against the gray
 * of the sentence gives 1.95:1 —below the 3:1 WCAG 1.4.1 asks for—; on a
 * phone, where there is no «hover», nobody knew it could be tapped.
 *
 * No `className`: whatever needs to be different is a variant here.
 */
export function TextLink(props: Omit<ComponentProps<typeof Link>, 'className'>) {
  return (
    <Link className="text-primary underline underline-offset-4 hover:decoration-2" {...props} />
  );
}
