import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function Input({ className, type, ...props }: ComponentProps<'input'>) {
  return (
    <input
      type={type}
      className={cn(
        'flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-base',
        'placeholder:text-muted-foreground',
        // Un anillo de 1px y el borde teñido. Con 2px el campo parecía crecer
        // al recibir el foco y el halo se comía la separación con el de al lado.
        'outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:border-ring',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'aria-invalid:border-destructive aria-invalid:focus-visible:ring-destructive',
        'md:text-sm',
        className,
      )}
      {...props}
    />
  );
}
