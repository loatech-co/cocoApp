import { cva, type VariantProps } from 'class-variance-authority';
import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react';
import type { ComponentProps, ComponentType } from 'react';

import { cn } from '@/shared/lib/utils';

/**
 * An INLINE notice: it stays where it is until it stops being true.
 *
 * ── How it differs from the floating notice ─────────────────────────────────
 * The one in `molecules/toast.tsx` appears in a corner, says something and leaves: it serves to
 * confirm an action that already happened —"it was saved"—. This one does not leave, because
 * it explains the state of what is underneath it: a form that could not be
 * submitted, a list empty because of a filter, an account not yet approved. If it left,
 * the reason would disappear and the screen would be left without explanation.
 *
 * ── The four tones, and when each one applies ───────────────────────────────
 * · `destructive` — something FAILED. It is the only red, and that is why it is the one that
 *   can be ignored the least: if everything were red, red would say nothing.
 * · `warning` — something is PENDING and can still be done. It goes in the theme's
 *   gold. An unrecorded payment is not an error.
 * · `success` — something went well and it needs saying where it happened.
 * · `info` — a fact that helps and that nobody has to resolve.
 *
 * ── Why each tone brings its icon ───────────────────────────────────────────
 * Because color alone is not enough: one in twelve men cannot tell red
 * from green, and neither shows in a black-and-white screenshot. The
 * icon says the same thing another way, and the component sets it so that it does not
 * depend on every call remembering.
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
        /* Red. Only what failed — never what is pending. */
        destructive: 'border-destructive/30 bg-destructive-surface text-destructive',
        warning: 'border-warning/30 bg-warning-surface text-warning',
        success: 'border-success/30 bg-success-surface text-success',
        info: 'border-info/30 bg-info-surface text-info',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export type AlertTone = NonNullable<VariantProps<typeof alertVariants>['variant']>;

/**
 * The icon of each tone. `default` has none: it announces nothing.
 *
 * It is exported because the FLOATING notice has the same four tones and has
 * to use the same four icons: an error that is a circle inline and
 * a triangle floating is two different errors for whoever is looking.
 */
const TONE_ICONS: Record<AlertTone, ComponentType<{ className?: string }> | null> = {
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
  const Icon = TONE_ICONS[variant ?? 'default'];

  return (
    // `role="alert"` only on what went wrong: a screen reader interrupts
    // whatever it is saying to read it, and doing that for an informative fact is
    // teaching people to ignore interruptions.
    <div
      role={variant === 'destructive' ? 'alert' : 'status'}
      className={cn(alertVariants({ variant }), className)}
      {...props}
    >
      {Icon && <Icon className="size-4 translate-y-0.5" aria-hidden="true" />}
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

/**
 * What failed and, below it, each thing that explains it: «La contraseña no cumple
 * la política» and the list of what it is missing.
 *
 * It was written three times —sign-up, password change and the
 * reset from admin— and one copy had already started
 * reading the details from somewhere else. Without details it is a normal error notice.
 */
export function ErrorAlert({ message, details = [] }: { message: string; details?: string[] }) {
  return (
    <Alert variant="destructive">
      <AlertDescription>
        {message}
        {details.length > 0 && (
          <ul className="mt-2 list-disc space-y-0.5 pl-4">
            {details.map((detail) => (
              <li key={detail}>{detail}</li>
            ))}
          </ul>
        )}
      </AlertDescription>
    </Alert>
  );
}
