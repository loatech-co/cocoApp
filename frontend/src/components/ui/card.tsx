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
        // Borde Y sombra, y no solo sombra como antes.
        //
        // La sombra del tema es tinta al 6 %: sobre un lienzo casi blanco se
        // ve, pero sobre uno casi negro una sombra oscura no separa de nada
        // —lo oscuro sobre lo oscuro no proyecta—. El borde funciona en los
        // dos, y con una sombra tan suave no llega a verse el contorno doble
        // que había que evitar.
        'rounded-lg border border-border bg-card text-card-foreground',
        'shadow-[0_1px_2px_rgba(15,31,29,0.04),0_8px_24px_-14px_rgba(15,31,29,0.12)]',
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
