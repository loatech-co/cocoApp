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
 *
 * El PESO de la letra también es de la base, por lo mismo: una variante lo
 * bajó a `font-medium` y su botón parecía más pequeño que el de al lado aunque
 * los dos medían exactamente igual.
 *
 * ── El suelo táctil, y por qué está en la BASE ──────────────────────────────
 * Por debajo del corte, 42px de alto y de ancho como mínimo. Los tamaños están
 * dibujados para un puntero: `sm` mide 36 y `default` 40. Apple dice 44 y
 * Material dice 48, así que 42 es el MÍNIMO, no la meta.
 *
 * `min-height`, no `height`: un control que ya es más alto se queda como está,
 * y por eso puede vivir en la base sin pelearse con ningún tamaño.
 *
 * En la base y no en cada llamada porque una excepción tiene que CONCEDERSE,
 * no descubrirse: desde fuera no se puede rebajar —la prueba de las llamadas
 * rechaza cualquier `min-h-0` igual que rechaza un `h-9`—, así que la única
 * forma de tener un botón más pequeño es añadir aquí un tamaño que lo diga.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background movil:min-h-[42px] movil:min-w-[42px]",
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
          'border border-border bg-card text-foreground hover:bg-secondary aria-pressed:border-primary/30 aria-pressed:bg-accent aria-pressed:text-accent-foreground',
      },
      size: {
        default: 'h-10 rounded-full px-5 py-2',
        sm: 'h-9 rounded-full px-4',
        lg: 'h-12 rounded-full px-7 text-base',
        /** 44×44 mínimo en mobile, por objetivo táctil accesible. */
        icon: 'size-11 rounded-full sm:size-10',
        /** El de las barras de herramientas: esquinas menos redondas. */
        chip: 'h-9 rounded-lg px-3',
        /**
         * El de un CAMPO de formulario: la misma caja que un `Input` o un
         * `Combo`.
         *
         * Existe porque el selector de fecha es un botón por dentro pero un
         * campo por fuera, y con `size="default"` salía con las esquinas
         * redondas del todo al lado de tres campos de esquina suave: la fila
         * se leía como dos sistemas distintos.
         */
        campo: 'h-10 rounded-lg px-3',
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
