import { cva, type VariantProps } from 'class-variance-authority';
import { X } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';

import { cn } from '@/shared/lib/utils';
import { REALCE } from '@/shared/ui/foundations/superficie';

/**
 * Etiquetas y chips: dos cosas parecidas que NO son la misma.
 *
 * ── La diferencia, y por qué importa ────────────────────────────────────────
 * Una ETIQUETA describe: dice de qué es algo —"Pendiente", "Ingreso"— y no se
 * puede pulsar. Un CHIP es un control: se enciende, se apaga o se quita.
 *
 * Si se dibujan igual, la gente intenta pulsar las etiquetas y no encuentra
 * los chips; y como la única forma de saber cuál es cuál sería probar, acaban
 * pulsándose todas. Por eso son dos componentes y no uno con una bandera: el
 * chip es un `<button>` de verdad, con su foco y su estado, y la etiqueta es
 * un `<span>` que no lo finge.
 *
 * ── Los colores salen del significado ───────────────────────────────────────
 * `ingreso`, `gasto`, `pendiente`, `error`: nunca "verde" o "ámbar". El día
 * que cambie el tema, el gasto seguirá siendo el gasto.
 */

const etiquetaVariants = cva(
  cn(
    'inline-flex items-center gap-1 whitespace-nowrap rounded-full border',
    'px-2 py-0.5 text-xs font-medium [&_svg]:size-3',
  ),
  {
    variants: {
      tono: {
        neutro: 'border-transparent bg-muted text-foreground',
        // Lo que todavía no está —«Pronto»—. Se apaga con la tinta apagada
        // del tema y nunca con opacidad: `muted-foreground` sobre `muted` da
        // 5:1 en los dos temas, y la misma etiqueta al 60 % daba 2,3:1.
        apagado: 'border-transparent bg-muted text-muted-foreground',
        contorno: 'border-border text-foreground',
        // `income`, no `success`: valen lo mismo —en una app de dinero «se
        // guardó» y «entró plata» son la misma buena noticia— pero esta
        // etiqueta dice INGRESO, y el token que lo nombra existe.
        ingreso: 'border-transparent bg-income-surface text-income',
        gasto: 'border-transparent bg-expense-surface text-expense',
        pendiente: 'border-transparent bg-warning-surface text-warning',
        info: 'border-transparent bg-info-surface text-info',
        error: 'border-transparent bg-destructive-surface text-destructive',
      },
    },
    defaultVariants: { tono: 'neutro' },
  },
);

/** Un rótulo que describe algo. No se pulsa. */
export function Etiqueta({
  className,
  tono,
  ...props
}: ComponentProps<'span'> & VariantProps<typeof etiquetaVariants>) {
  return <span className={cn(etiquetaVariants({ tono }), className)} {...props} />;
}

/**
 * Un chip: se pulsa.
 *
 * Con `onQuitar` lleva su aspa y se comporta como un filtro puesto; sin él, es
 * una opción que se enciende y se apaga y lo dice con `aria-pressed`.
 *
 * El aspa va en su propio botón y no en el del chip: pulsar "Costos fijos"
 * para abrirlo y pulsarlo para quitarlo no pueden ser el mismo gesto, y un
 * solo botón obligaría a adivinar cuál de las dos cosas va a pasar.
 */
export function Chip({
  activo = false,
  onQuitar,
  etiquetaDeQuitar,
  className,
  children,
  ...props
}: Omit<ComponentProps<'button'>, 'children'> & {
  activo?: boolean;
  onQuitar?: () => void;
  /** Nombre accesible del aspa. Sin él, un lector dice solo "botón". */
  etiquetaDeQuitar?: string;
  children: ReactNode;
}) {
  const forma = chipShape(activo);

  if (!onQuitar) {
    return (
      <button type="button" aria-pressed={activo} className={cn(forma, className)} {...props}>
        {children}
      </button>
    );
  }

  return (
    <span className={cn(forma, 'pr-1', className)}>
      {/*
        El nombre es un botón solo si abre algo.

        Con `onQuitar` y sin `onClick` —una palabra clave de un concepto, que se
        pone y se quita y no lleva a ninguna parte— era un `<button>` que al
        pulsarlo no hacía nada: un lector de pantalla lo anuncia como pulsable,
        el cursor cambia a mano, y el único gesto que funciona es el aspa de al
        lado. Un nombre que no hace nada es texto, y se escribe como texto.

        Sin contorno de foco, como todos los botones: lo quita la regla de
        `index.css`. Aquí sobraba además por el sitio —este botón vive pegado
        contra el canto redondeado del chip, así que cualquier anillo suyo se
        saldría de él—.
      */}
      {props.onClick ? (
        <button type="button" className="min-w-0 truncate rounded-md" {...props}>
          {children}
        </button>
      ) : (
        <span className="min-w-0 truncate">{children}</span>
      )}
      <button
        type="button"
        onClick={onQuitar}
        aria-label={etiquetaDeQuitar ?? 'Quitar'}
        title={etiquetaDeQuitar ?? 'Quitar'}
        className={cn(
          'flex size-4 shrink-0 items-center justify-center rounded-full transition-colors',
          // Encendido, el chip es `--primary` y el aspa lleva su tinta: el
          // resaltado tiene que ser esa misma tinta rebajada, no un negro.
          // En oscuro el primario es teal CLARO, así que un negro al 20 %
          // hacía un borrón oscuro sobre un chip claro.
          activo ? 'hover:bg-primary-foreground/20' : 'hover:bg-muted-foreground/20',
        )}
      >
        <X className="size-3" aria-hidden="true" />
      </button>
    </span>
  );
}

/**
 * El nombre viejo, para no romper las cinco pantallas que ya lo usan.
 *
 * `Badge` con `variant` era el nombre de shadcn, en inglés y describiendo la
 * forma en vez del papel. Se migran cuando se toquen; mientras, esto traduce.
 */
export function Badge({
  variant,
  className,
  ...props
}: ComponentProps<'span'> & {
  variant?: 'default' | 'outline' | 'income' | 'expense' | 'warning' | 'info';
}) {
  const equivalencia = {
    default: 'neutro',
    outline: 'contorno',
    income: 'ingreso',
    expense: 'gasto',
    warning: 'pendiente',
    info: 'info',
  } as const;

  return <Etiqueta tono={equivalencia[variant ?? 'default']} className={className} {...props} />;
}

/** La forma del chip, encendido o apagado. */
function chipShape(activo: boolean): string {
  return cn(
    /*
      ── La esquina: 6px, no una píldora ─────────────────────────────────────
      El `rounded-full` no lo decidió nadie: es el redondeo por defecto de un
      chip en cualquier librería. Pero aquí el chip no anda solo —vive dentro
      de un bloque de 10px, dentro de una tarjeta de 10px— y una píldora al
      lado de dos esquinas cuadradas es lo que la regla del radio llama dos
      sistemas distintos. Menor que el estándar sí, que es lo que la regla
      permite a un chip; con otra forma, no.

      ── El alto: 32px ───────────────────────────────────────────────────────
      Medía 26, que es lo que salía de sumar 12 de letra y 4 de relleno arriba
      y abajo: un alto que no eligió nadie tampoco. 32 es el escalón de la
      escala que queda debajo de los 36 de un control, así que un chip sigue
      leyéndose como contenido y no como un botón, pero ya se puede pulsar con
      el dedo. El aire lateral sube con él, de 10 a 12: en una caja más alta,
      el mismo relleno estrecho hace que el nombre parezca pegado al canto.
    */
    'inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md border px-3 text-xs',
    // El nombre de un concepto es un nombre propio: a 12px, el peso normal se
    // deshace contra el relleno del chip.
    'font-medium transition-colors [&_svg]:size-3.5',
    activo
      ? 'border-transparent bg-primary text-primary-foreground'
      : /*
          ── El relleno: la tinta al 10 %, y no una superficie del tema ────────
          Llevaba `bg-card`, y un relleno fijo solo funciona si queda escalón
          contra lo que tiene detrás. Este chip vive dentro de un bloque, que es
          `muted`, y el escalón salía en sentidos contrarios: en claro `card` es
          blanco sobre un lienzo cálido y el chip se levanta; en oscuro `card`
          es más OSCURO que el bloque, así que el mismo chip se hunde y se lee
          como un agujero. Quitarle el relleno del todo tampoco valía: el canto
          solo está diez puntos por encima de la superficie y no sostiene nada.

          La tinta al 10 % se mueve SIEMPRE hacia el texto: en claro oscurece,
          en oscuro aclara. Es decir, hace exactamente lo que la regla de las
          tres superficies pide en cada tema —dentro baja en claro y sube en
          oscuro— sin depender de qué superficie tenga debajo, que es lo que
          aquí no se puede saber.

          ── Y responde con el realce compartido ───────────────────────────────
          El `hover:bg-muted` que tenía era un fallo aparte: dentro de un bloque
          `muted`, señalar el chip le daba exactamente el color de la caja que
          lo contiene y desaparecía.
        */
        cn('border-border bg-foreground/10 text-foreground', REALCE),
  );
}
