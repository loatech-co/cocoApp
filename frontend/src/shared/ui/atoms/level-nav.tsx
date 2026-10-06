import { ChevronLeft, ChevronRight } from 'lucide-react';

import { t } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { REALCE } from '@/shared/ui/foundations/superficie';

/*
 * Moverse por un árbol de niveles —centros, categorías, conceptos— dentro de
 * una lista: bajar a lo que hay dentro de una fila y volver al de arriba.
 */

/**
 * La vuelta al nivel de arriba: un galón y los niveles recorridos.
 *
 * Bajar de nivel es un clic; subir tiene que serlo también. La usan la dona
 * del resumen y el filtro de clasificación. `fuerte` es el peso del filtro,
 * donde el camino hace de título del desplegable.
 */
export function BackCrumb({
  path,
  isStrong = false,
  onBack,
}: {
  path: readonly string[];
  isStrong?: boolean;
  onBack: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onBack}
      className={cn(
        'flex min-w-0 items-center gap-1 rounded-sm text-xs text-muted-foreground transition-colors hover:text-foreground',
        isStrong && 'font-semibold',
      )}
    >
      <ChevronLeft className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">{path.join(' · ')}</span>
    </button>
  );
}

/**
 * Bajar a lo que hay dentro de una fila: el galón a la derecha.
 *
 * Ocupa el alto ENTERO de la fila y 36 de ancho, porque la fila ya es otro
 * control —marcar— y este es una segunda puerta en el mismo renglón.
 */
export function DrillButton({ name, onDrill }: { name: string; onDrill: () => void }) {
  return (
    <button
      type="button"
      onClick={onDrill}
      aria-label={t('ui.levelNav.open', { name })}
      title={t('ui.levelNav.open', { name })}
      className={cn(
        'grid w-9 shrink-0 place-items-center text-muted-foreground transition-colors',
        REALCE,
      )}
    >
      <ChevronRight className="size-4" aria-hidden="true" />
    </button>
  );
}
