import type { ComponentProps } from 'react';

import { cn } from '@/shared/lib/utils';
import { REALCE } from '@/shared/ui/foundations/superficie';

/**
 * An action that reads as TEXT within a line: «Limpiar», «Volver»,
 * «Elegir por centro y categoría».
 *
 * It is not a `Button`: a button has its own height, padding and weight, and in the middle
 * of a sentence or next to a counter it eats the line. This one goes at the size of
 * the surrounding text and reserves no room.
 *
 * | Tone        | Where                                                     |
 * | ----------- | --------------------------------------------------------- |
 * | `primary`   | The action of a counter: «3 marcados · Limpiar»           |
 * | `subtle`    | An alternative below a field, in small print              |
 * | `highlight` | An exit inside a dropdown, with the menu's highlight      |
 *
 * No `className`: whatever needs to be different is one more tone here.
 */
const TONES = {
  primary: 'rounded-sm font-medium text-primary hover:underline',
  // 24px high even though the text measures 12: it lives next to a field, and a target
  // of 16 falls below the touch minimum (WCAG 2.5.8). The text is centered
  // in that box, so visually it does not grow.
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
