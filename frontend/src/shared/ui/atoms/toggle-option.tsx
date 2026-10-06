import type { ComponentProps } from 'react';

import { cn } from '@/shared/lib/utils';
import { HIGHLIGHT } from '@/shared/ui/foundations/surface';

/**
 * An option of a short list that is TURNED ON: the range shortcuts («Este
 * mes», «Últimos 90 días»…) next to the calendar.
 *
 * It carries no check mark or other mark, so what is on is painted with the
 * accent and the hover with the highlight: the exception of rule 8, the
 * same as the `tool` button. It is announced with `aria-pressed`.
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
        isOn ? 'bg-primary/15 font-medium text-primary' : cn('text-muted-foreground', HIGHLIGHT),
      )}
      {...props}
    />
  );
}
