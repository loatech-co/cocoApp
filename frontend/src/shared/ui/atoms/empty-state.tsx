import type { ComponentType, ReactNode } from 'react';

import { cn } from '@/shared/lib/utils';

/**
 * Lo que se muestra cuando no hay nada que mostrar.
 *
 * ── Por qué no basta con dejarlo en blanco o pintar ceros ───────────────────
 * Una gráfica en cero NO significa "no hay datos": significa "gastaste cero",
 * que es una afirmación distinta y casi siempre falsa. Con un filtro puesto,
 * la línea plana hace creer que ese mes no hubo movimiento cuando lo que pasa
 * es que el recorte los dejó todos fuera.
 *
 * Por eso el estado vacío dice DOS cosas: que no hay nada, y qué hacer para
 * que lo haya. Un hueco en blanco no dice ninguna de las dos.
 */
export function EmptyState({
  Icon,
  title,
  description,
  action,
  className,
}: {
  Icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  title: string;
  /** Qué hacer para salir de aquí. */
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 px-6 py-12 text-center',
        className,
      )}
    >
      <span className="grid size-12 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-6" aria-hidden={true} />
      </span>

      <span>
        <span className="block font-display text-base font-semibold">{title}</span>
        {description && (
          <span className="mx-auto mt-1 block max-w-xs text-sm text-muted-foreground">
            {description}
          </span>
        )}
      </span>

      {action}
    </div>
  );
}
