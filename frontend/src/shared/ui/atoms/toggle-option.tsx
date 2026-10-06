import type { ComponentProps } from 'react';

import { cn } from '@/shared/lib/utils';
import { REALCE } from '@/shared/ui/foundations/superficie';

/**
 * Una opción de una lista corta que se ENCIENDE: los atajos de rango («Este
 * mes», «Últimos 90 días»…) al lado del calendario.
 *
 * No lleva palomita ni otra marca, así que lo encendido se pinta con el
 * acento y el paso del cursor con el realce: la excepción de la regla 8, la
 * misma que el botón `herramienta`. Se anuncia con `aria-pressed`.
 */
export function ToggleOption({
  isOn,
  type = 'button',
  ...props
}: Omit<ComponentProps<'button'>, 'className' | 'aria-pressed'> & { isOn: boolean }) {
  return (
    <button
      type={type}
      aria-pressed={isOn}
      className={cn(
        'w-full rounded-md px-3 py-1.5 text-left text-sm transition-colors',
        isOn ? 'bg-primary/15 font-medium text-primary' : cn('text-muted-foreground', REALCE),
      )}
      {...props}
    />
  );
}
