import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function Card({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        // Sin borde: la tarjeta se separa del fondo hueso por SOMBRA, no por
        // línea. Con borde y sombra a la vez el contorno se ve doble y la
        // interfaz se llena de rayas.
        //
        // La sombra es cálida, no gris: una sombra neutra sobre un fondo hueso
        // se ve sucia. Lleva el matiz del propio fondo.
        'rounded-2xl bg-card text-card-foreground',
        'shadow-[0_1px_2px_rgba(65,60,47,0.04),0_8px_24px_-12px_rgba(65,60,47,0.16)]',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-1.5 p-6', className)} {...props} />;
}

export function CardTitle({ className, ...props }: ComponentProps<'h2'>) {
  return <h2 className={cn('font-serif text-xl font-semibold leading-tight', className)} {...props} />;
}

export function CardDescription({ className, ...props }: ComponentProps<'p'>) {
  return <p className={cn('text-sm text-muted-foreground', className)} {...props} />;
}

export function CardContent({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('p-6 pt-0', className)} {...props} />;
}

export function CardFooter({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex items-center p-6 pt-0', className)} {...props} />;
}
