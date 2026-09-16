import { cva, type VariantProps } from 'class-variance-authority';
import { X } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';

import { cn } from '@/lib/utils';

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

export type TonoDeEtiqueta = NonNullable<VariantProps<typeof etiquetaVariants>['tono']>;

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
  const forma = cn(
    'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs',
    'transition-colors [&_svg]:size-3.5',
    activo
      ? 'border-transparent bg-primary font-medium text-primary-foreground'
      : 'border-border bg-card text-foreground hover:bg-muted',
  );

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
        `outline-none` SIN nada que lo reemplace dejaba este botón sin ningún
        indicador de foco: la regla global de `index.css` dibuja un contorno en
        `:focus-visible`, y una utilidad de Tailwind le gana a la capa base. El
        aspa de al lado sí se veía; la parte que se pulsa para abrir, no.

        El anillo va por dentro —`ring-inset`— porque este botón vive pegado
        contra el borde redondeado del chip, y uno por fuera se saldría de él.
      */}
      <button
        type="button"
        className={cn(
          'min-w-0 truncate rounded-full outline-none',
          'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
        )}
        {...props}
      >
        {children}
      </button>
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
