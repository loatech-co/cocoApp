import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function Card({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        // 16px, que es el radio ESTÁNDAR de todo contenedor de la app: las
        // tarjetas, los desplegables y los modales. Puede ser menor donde haga
        // falta —una casilla, un chip— pero nunca mayor: dos contenedores
        // vecinos con esquinas distintas se leen como dos sistemas distintos.
        //
        // Sin borde: la tarjeta se separa del lienzo por SOMBRA, no por línea.
        // Con borde y sombra a la vez el contorno se ve doble.
        //
        // La sombra lleva el matiz verde del fondo, no gris neutro: una sombra
        // gris sobre un lienzo verdoso se ve sucia.
        'rounded-lg bg-card text-card-foreground',
        'shadow-[0_1px_2px_rgba(12,31,24,0.04),0_10px_30px_-14px_rgba(12,31,24,0.14)]',
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
  return <h2 className={cn('text-lg font-semibold leading-tight tracking-tight', className)} {...props} />;
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
