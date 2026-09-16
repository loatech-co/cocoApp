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
        /** El acento del tema: una superficie tenue con su propia tinta. */
        acento: 'bg-accent text-accent-foreground hover:brightness-95',
        /**
         * El `secondary` del TEMA, que aquí es el oro.
         *
         * No es "un botón gris": para eso están `ghost` y `outline`. Este
         * existe para la acción secundaria que sí quiere destacar, y lleva la
         * tinta que el tema declara para él —nunca blanco por costumbre—.
         */
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/90',
        outline: 'border border-input bg-background hover:bg-muted hover:text-foreground',
        ghost: 'hover:bg-muted hover:text-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
        /** Rojo. Reservado para acciones destructivas — nada más. */
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        /**
         * Los controles de una barra de herramientas: sobre el fondo de la
         * página, con el mismo peso que un campo de texto y no el de una
         * acción principal. Se encienden con `aria-pressed`.
         */
        /*
          Encendido lleva el ACENTO, igual que la sección en la que uno está
          dentro del riel: lavado plano del color al 15 % y la letra del
          color. Antes se encendía con `accent`, que es la superficie de lo
          que responde al cursor: encendido y señalado se pintaban casi
          igual, y en una barra de herramientas —donde lo encendido no tiene
          ni palomita ni texto que lo diga— el color más fuerte tiene que ir
          a lo encendido. Es la excepción que la regla 8 ya contemplaba.
        */
        herramienta:
          'border border-border bg-card text-foreground hover:bg-muted aria-pressed:border-primary/40 aria-pressed:bg-primary/15 aria-pressed:text-primary',
        /**
         * Un botón que hace de CAMPO: el selector de fecha, que por dentro es
         * un botón porque abre un calendario, pero en la fila de un formulario
         * es un campo más y tiene que leerse como tal.
         *
         * Se diferencia de `herramienta` en dos cosas, y las dos importan:
         * lleva el borde de los campos —`--input`, no `--border`— y al pasar
         * por encima TIÑE EL BORDE en vez de rellenarse. Un campo que se
         * rellena al pasar el ratón se lee como un botón, y en una fila donde
         * el de al lado es un `Select` que solo se tiñe, uno de los dos
         * parpadea y el otro no.
         *
         * El peso también baja: lo que se lee ahí es un valor, no una acción.
         */
        /*
         * El relleno horizontal NO se puede fijar aquí, y hace falta decirlo
         * porque se intentó: `cva` emite las clases en el orden de su
         * configuración —base, variante, tamaño—, así que el `px-5` del
         * tamaño va DESPUÉS y le gana. Un `px-3` escrito en esta variante no
         * hace nada, y el selector de fecha quedaba con su valor ocho píxeles
         * más adentro que la etiqueta que lo nombra.
         *
         * Lo pone su llamada, que es lo último que ve `cn`. La prueba de las
         * llamadas lo permite a propósito: prohíbe el alto, el relleno
         * VERTICAL y el radio —que son del tamaño— y no el horizontal.
         */
        campo:
          'border border-input bg-card font-normal text-foreground transition-colors hover:border-ring/40 aria-expanded:border-ring',
      },
      /*
        ── DOS tamaños, y los mismos para todo ──────────────────────────────
        `sm` mide 36 y `md` mide 44, y esas dos alturas valen para un botón,
        un campo de texto, un desplegable y un selector de fecha. Una fila de
        controles donde el botón mide 40, el campo 42 y el selector 36 se ve
        temblorosa aunque nadie sepa decir por qué.

        Eran ocho —default, sm, lg, icon, icon-sm, chip, chip-icon, campo— y
        cada uno con su alto y su radio. Ocho medidas es no tener ninguna: se
        elegía la que se pareciera a la de al lado, y así se separaron.

        Las variantes de icono son las mismas alturas en cuadrado. No son un
        tamaño más: son el mismo, sin texto.

        44 es además el objetivo táctil mínimo que pide la accesibilidad, así
        que el tamaño de formulario ya lo cumple sin excepciones para el móvil.
      */
      size: {
        sm: 'h-9 rounded-lg px-3',
        md: 'h-11 rounded-lg px-5',
        'sm-icon': 'size-9 rounded-lg',
        'md-icon': 'size-11 rounded-lg',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
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
