import { cva, type VariantProps } from 'class-variance-authority';
import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react';
import type { ComponentProps, ComponentType } from 'react';

import { cn } from '@/lib/utils';

/**
 * Un aviso EN LÍNEA: se queda donde está hasta que deja de ser cierto.
 *
 * ── En qué se diferencia del aviso flotante ─────────────────────────────────
 * El de `ui/aviso.tsx` aparece en una esquina, dice algo y se va: sirve para
 * confirmar una acción que ya pasó —"se guardó"—. Este no se va, porque
 * explica el estado de lo que tiene debajo: un formulario que no se pudo
 * enviar, una lista vacía por un filtro, una cuenta sin aprobar. Si se fuera,
 * el motivo desaparecería y quedaría la pantalla sin explicación.
 *
 * ── Los cuatro tonos, y cuándo es cada uno ──────────────────────────────────
 * · `destructive` — algo FALLÓ. Es el único rojo, y por eso es el único que se
 *   puede ignorar menos: si todo fuera rojo, el rojo no diría nada.
 * · `warning` — algo está PENDIENTE y todavía se puede hacer. Va en el oro del
 *   tema. Un pago sin registrar no es un error.
 * · `success` — algo salió bien y hace falta decirlo donde ocurrió.
 * · `info` — un dato que ayuda y que nadie tiene que resolver.
 *
 * ── Por qué cada tono trae su icono ─────────────────────────────────────────
 * Porque el color solo no basta: uno de cada doce hombres no distingue el rojo
 * del verde, y ninguno de los dos se ve en una captura en blanco y negro. El
 * icono dice lo mismo por otra vía, y va puesto por el componente para que no
 * dependa de que cada llamada se acuerde.
 */
const alertVariants = cva(
  cn(
    'relative grid w-full grid-cols-[auto_1fr] items-start gap-x-3 gap-y-1',
    'rounded-lg border px-4 py-3 text-sm',
    '[&>svg]:size-4 [&>svg]:translate-y-0.5',
  ),
  {
    variants: {
      variant: {
        default: 'border-border bg-card text-card-foreground',
        /* Rojo. Solo lo que falló — nunca lo que está pendiente. */
        destructive: 'border-destructive/30 bg-destructive-surface text-destructive',
        warning: 'border-warning/30 bg-warning-surface text-warning',
        success: 'border-success/30 bg-success-surface text-success',
        info: 'border-info/30 bg-info-surface text-info',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export type TonoDeAviso = NonNullable<VariantProps<typeof alertVariants>['variant']>;

/**
 * El icono de cada tono. `default` no lleva: no anuncia nada.
 *
 * Se exporta porque el aviso FLOTANTE tiene los mismos cuatro tonos y tiene
 * que usar los mismos cuatro iconos: un error que en línea es un círculo y
 * flotando es un triángulo son dos errores distintos para quien mira.
 */
const ICONOS_DE_TONO: Record<TonoDeAviso, ComponentType<{ className?: string }> | null> = {
  default: null,
  destructive: CircleAlert,
  warning: TriangleAlert,
  success: CircleCheck,
  info: Info,
};

export function Alert({
  className,
  variant = 'default',
  children,
  ...props
}: ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  const Icono = ICONOS_DE_TONO[variant ?? 'default'];

  return (
    // `role="alert"` solo en lo que salió mal: un lector de pantalla interrumpe
    // lo que esté diciendo para leerlo, y hacer eso por un dato informativo es
    // enseñarle a la gente a ignorar las interrupciones.
    <div
      role={variant === 'destructive' ? 'alert' : 'status'}
      className={cn(alertVariants({ variant }), className)}
      {...props}
    >
      {Icono && <Icono className="size-4 translate-y-0.5" aria-hidden="true" />}
      {children}
    </div>
  );
}

export function AlertTitle({ className, ...props }: ComponentProps<'h5'>) {
  return <h5 className={cn('col-start-2 font-semibold leading-tight', className)} {...props} />;
}

export function AlertDescription({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('col-start-2 [&_p]:leading-relaxed', className)} {...props} />;
}
