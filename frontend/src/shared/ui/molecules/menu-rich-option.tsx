import type { ComponentType } from 'react';

import { cn } from '@/shared/lib/utils';
import { Etiqueta } from '@/shared/ui/atoms/badge';
import { ChipIcono, type ColorDeChip } from '@/shared/ui/atoms/chip-icono';
import { REALCE } from '@/shared/ui/foundations/superficie';

/**
 * Una opción de menú con su pastel de color y una línea de ayuda debajo. Hoy,
 * las dos formas de empezar un movimiento: gasto o ingreso.
 *
 * ── Por qué no son dos filas de texto ───────────────────────────────────────
 * Porque esta es la interacción que se repite todos los días, y en ella la
 * primera decisión —gasto o ingreso— no es un ajuste: es de qué se va a
 * hablar. Dos renglones iguales obligan a leer para distinguirlos; con el
 * pastel del color que ya significa eso en el resumen —violeta para lo que
 * sale, verde para lo que entra— la elección se hace mirando, que es lo que
 * uno quiere hacer veinte veces por semana.
 *
 * La segunda línea existe por lo mismo. "Gasto" e "Ingreso" se confunden al
 * leer rápido —empiezan distinto pero se parecen en la forma— y "plata que
 * sale" contra "plata que entra" no se confunden nunca.
 */
export function MenuOpcionDetallada({
  Icono,
  color,
  titulo,
  ayuda,
  nota,
  deshabilitada = false,
  onClick,
}: {
  Icono: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  color: ColorDeChip;
  titulo: string;
  ayuda: string;
  /** Por qué no se puede todavía, en una palabra. */
  nota?: string;
  deshabilitada?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={deshabilitada}
      aria-disabled={deshabilitada}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-md px-2.5 py-2.5 text-left transition-colors',
        deshabilitada ? 'cursor-not-allowed opacity-50' : REALCE,
      )}
    >
      <ChipIcono Icono={Icono} color={color} tamano="sm" />

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{titulo}</span>
        <span className="block truncate text-xs text-muted-foreground">{ayuda}</span>
      </span>

      {/* La misma etiqueta que en el resto de la app. Era un `<span>` con su
          propio redondeo, su propio relleno y un tamaño de letra a mano —11px,
          que no está en la escala—: tres decisiones repetidas para decir lo
          que `Etiqueta` ya dice. */}
      {nota && (
        <Etiqueta tono="neutro" className="shrink-0 text-muted-foreground">
          {nota}
        </Etiqueta>
      )}
    </button>
  );
}
