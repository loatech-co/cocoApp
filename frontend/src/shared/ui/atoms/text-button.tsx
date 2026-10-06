import type { ComponentProps } from 'react';

import { cn } from '@/shared/lib/utils';
import { REALCE } from '@/shared/ui/foundations/superficie';

/**
 * Una acción que se lee como TEXTO dentro de una línea: «Limpiar», «Volver»,
 * «Elegir por centro y categoría».
 *
 * No es un `Button`: un botón tiene alto, relleno y peso propios, y en medio
 * de una frase o junto a un contador se come el renglón. Esta va al tamaño de
 * la letra que la rodea y no reserva sitio.
 *
 * | Tono       | Dónde                                                     |
 * | ---------- | --------------------------------------------------------- |
 * | `primario` | La acción de un contador: «3 marcados · Limpiar»          |
 * | `tenue`    | Una alternativa debajo de un campo, en letra pequeña      |
 * | `realce`   | Una salida dentro de un desplegable, con el realce del menú |
 *
 * Sin `className`: lo que haga falta distinto es un tono más aquí.
 */
const TONES = {
  primary: 'rounded-sm font-medium text-primary hover:underline',
  // 24px de alto aunque la letra mida 12: vive junto a un campo, y un blanco
  // de 16 queda por debajo del mínimo táctil (WCAG 2.5.8). El texto se centra
  // en esa caja, así que a la vista no crece.
  subtle: cn(
    'inline-flex min-h-6 items-center',
    'text-xs text-muted-foreground underline-offset-2 hover:underline',
  ),
  highlight: cn('rounded-md px-1.5 py-0.5', REALCE),
} as const;

export function TextButton({
  tone,
  type = 'button',
  ...props
}: Omit<ComponentProps<'button'>, 'className'> & { tone: keyof typeof TONES }) {
  return <button type={type} className={cn('shrink-0', TONES[tone])} {...props} />;
}
