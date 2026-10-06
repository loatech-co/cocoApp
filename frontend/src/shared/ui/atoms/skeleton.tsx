import type { ComponentProps } from 'react';

import { cn } from '@/shared/lib/utils';

/**
 * Placeholder with the SHAPE of the content that is about to arrive, not a generic
 * spinner: the screen does not jump when the data lands.
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
