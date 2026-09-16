import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function Input({ className, type, ...props }: ComponentProps<'input'>) {
  return (
    <input
      type={type}
      className={cn(
        'flex h-11 w-full rounded-lg border border-input bg-card px-3 py-2 text-base',
        // El suelo táctil, aunque hoy sobre: 44 ya pasa de 42. Se declara
        // igual porque `piso-tactil.test.ts` pide que quien dibuja un control
        // lo diga, y el día que alguien baje este alto el suelo sigue puesto.
        'movil:min-h-[42px]',
        // El suelo táctil del teléfono. 40 es la medida de puntero; 42 es el
        // mínimo cuando lo que apunta es un dedo.
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
