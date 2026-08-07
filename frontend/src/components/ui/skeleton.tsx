import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/**
 * Placeholder con la FORMA del contenido que va a llegar, no un spinner
 * genérico: la pantalla no salta cuando los datos aterrizan.
 */
export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-md bg-muted', className)}
      {...props}
    />
  );
}
