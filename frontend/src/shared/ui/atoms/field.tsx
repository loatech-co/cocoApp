import { type ReactNode } from 'react';

import { cn } from '@/shared/lib/utils';
import { DentroDeUnCampo } from '@/shared/ui/foundations/field';

/**
 * A form field: its name INSIDE the control, and the control.
 *
 * ── What it does ────────────────────────────────────────────────────────────
 * The label starts where the placeholder would be. When the field is focused it
 * shrinks and moves up to the top of the field itself, leaving its place to the
 * placeholder —which is the example, not the name—. When typing, the placeholder
 * disappears and what was typed remains. When the field is left, the label stays
 * up if there is something and goes down if not.
 *
 * The state machine is in `index.css`, under `.campo`, and not here: they are
 * four different triggers that mean the same thing and this component knows none
 * of them. The why is written there.
 *
 * ── Why the name goes inside and not above ──────────────────────────────────
 * It used to go above, with this argument: a placeholder disappears when typing, so
 * when reviewing an already filled form nobody knows what each box was. The
 * argument still stands and that is why the label is NOT a placeholder: when there is
 * something typed it does not leave, it stays small on the border. What is gained is the
 * line it took above each field —six fields are six lines— and
 * that the name and the value read as a single thing instead of two.
 *
 * ── Why the `id` is mandatory ───────────────────────────────────────────────
 * It is the only thing that ties the label to the control for whoever navigates with a screen
 * reader. A floating label that is not associated is decoration: the
 * name is seen and not heard.
 */
export function Field({
  label,
  id,
  description,
  className,
  children,
}: {
  label: string;
  /** The same `id` the control carries: it is what ties them. */
  id: string;
  /** A line below, for what the name cannot quite say. */
  description?: string | undefined;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {/*
        The control goes FIRST and the label after, even though it looks the
        other way round: the label is absolutely positioned on top of it, and
        putting it first in the markup would force the control to be the
        next sibling, which is exactly what the `.campo` selectors do not
        need to know.
      */}
      <div className="campo">
        <DentroDeUnCampo.Provider value={true}>{children}</DentroDeUnCampo.Provider>
        <label htmlFor={id}>{label}</label>
      </div>

      {description && (
        <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
      )}
    </div>
  );
}
