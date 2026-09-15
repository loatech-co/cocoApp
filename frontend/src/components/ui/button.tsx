import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/**
 * El botón. TODOS los botones.
 *
 * ── Por qué la altura y el radio viven en `size` y no en la base ────────────
 * Porque son lo que hay que cambiar junto. Cuando el radio estaba en la base,
 * cualquier botón que necesitara esquinas menos redondas lo pisaba con un
 * `className`, y con él se colaba también una altura distinta: así acabaron
 * conviviendo cuatro alturas en una misma barra. Ahora elegir un tamaño elige
 * las dos cosas, y no hay nada que pisar.
 *
 * Si hace falta una medida nueva, se añade un `size` aquí. Un `className` con
 * `h-` o `rounded-` en una llamada suelta es la señal de que falta un tamaño.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        /**
         * El acento lima. El texto va en TINTA, no en blanco: blanco sobre lima
         * da 1.23:1 de contraste, muy por debajo del 4.5:1 que exige el texto.
         */
        acento: 'bg-accent text-accent-foreground hover:brightness-95',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        outline: 'border border-input bg-background hover:bg-secondary hover:text-secondary-foreground',
        ghost: 'hover:bg-secondary hover:text-secondary-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
        /** Rojo. Reservado para acciones destructivas — nada más. */
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        /**
         * Los controles de una barra de herramientas: sobre el fondo de la
         * página, con el mismo peso que un campo de texto y no el de una
         * acción principal. Se encienden con `aria-pressed`.
         */
        herramienta:
          'border border-border bg-card font-medium text-foreground hover:bg-secondary aria-pressed:border-primary/30 aria-pressed:bg-accent aria-pressed:text-accent-foreground',
      },
      size: {
        default: 'h-10 rounded-full px-5 py-2',
        sm: 'h-9 rounded-full px-4',
        lg: 'h-12 rounded-full px-7 text-base',
        /** 44×44 mínimo en mobile, por objetivo táctil accesible. */
        icon: 'size-11 rounded-full sm:size-10',
        /** El de las barras de herramientas: esquinas menos redondas. */
        chip: 'h-9 rounded-lg px-3',
        /** El mismo, cuadrado, para un icono solo. */
        'chip-icon': 'size-9 rounded-lg',
        /** Un icono pequeño y redondo: flechas de un calendario, cerrar… */
        'icon-sm': 'size-8 rounded-full',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export type ButtonProps = ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  };

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : 'button';
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export { buttonVariants };
