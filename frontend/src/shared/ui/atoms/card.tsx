import type { ComponentProps } from 'react';

import { cn } from '@/shared/lib/utils';

export function Card({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        // 10px, que es el radio ESTÁNDAR de todo contenedor de la app: las
        // tarjetas, los desplegables y los modales. Puede ser menor donde haga
        // falta —una casilla, un chip— pero nunca mayor: dos contenedores
        // vecinos con esquinas distintas se leen como dos sistemas distintos.
        //
        // ── SIN borde ─────────────────────────────────────────────────────
        // Lo que separa la tarjeta del fondo es el ESCALÓN DE SUPERFICIE: la
        // tarjeta es el material y se apoya en el pozo, que va por debajo.
        // Ese escalón existe en los dos temas y no dibuja ninguna línea.
        //
        // El borde hacía ese trabajo porque antes no había escalón —el lienzo
        // y la tarjeta eran casi el mismo color, así que hacía falta una línea
        // para decir dónde acababa una—. El resultado era una retícula de
        // líneas de 1px por toda la pantalla, que es la firma visual de un
        // panel de administración de hace diez años, y encima doblada con la
        // sombra.
        //
        // Lo que SÍ conserva el canto es lo que flota (regla 9): un
        // desplegable del color del material, abierto sobre una tarjeta del
        // mismo color, no tiene otra forma de decir dónde empieza.
        //
        // La sombra se queda, y solo trabaja en claro: es `--sombra-pegada`,
        // la del tema para lo APOYADO en la página. Sobre un pozo casi negro
        // no proyecta nada —lo oscuro sobre lo oscuro no hace sombra— y ahí
        // el escalón es lo único que separa. En claro añade el medio
        // milímetro de despegue que el escalón por sí solo no da.
        'rounded-lg bg-card text-card-foreground',
        'shadow-[var(--sombra-pegada)]',
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
  // Sin `tracking-tight`: el tema declara el interletraje en cero y Geist ya
  // viene cerrada de por sí. Apretarla apiña los títulos de 18px; el −0.025em
  // que llevaba compensaba una familia más suelta que ya no es esta.
  return <h2 className={cn('text-lg font-semibold leading-tight', className)} {...props} />;
}

export function CardDescription({ className, ...props }: ComponentProps<'p'>) {
  return <p className={cn('text-sm text-muted-foreground', className)} {...props} />;
}

export function CardContent({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('p-6 pt-0', className)} {...props} />;
}
