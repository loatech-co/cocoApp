import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';

import { t } from '@/shared/lib/i18n';
import { Button } from '@/shared/ui/atoms/button';
import { Card, CardContent } from '@/shared/ui/atoms/card';
import { Donut } from '@/shared/ui/atoms/donut';
import { BackCrumb } from '@/shared/ui/atoms/level-nav';

interface DistributionProps {
  rows: { categoryId: number | null; name: string; total: string; count: number }[];
  level: string;
  /** De quién son las filas. `null` cuando son los centros de costos. */
  parent: { id: number; name: string } | null;
  totalSpent: string;
  /** El camino hasta donde se bajó. Vacío = se está en los centros de costos. */
  path: { id: number; name: string }[];
  onDrillDown: (id: number) => void;
  onDrillUp: () => void;
}

/**
 * En qué se fue, al nivel que corresponda.
 *
 * Cada fila BAJA un nivel al tocarla: de centros a categorías, de categorías a
 * conceptos. Es la forma de responder "¿y dentro de esto, qué?" sin cambiar de
 * pantalla ni perder el rango de fechas.
 */
/**
 * En qué se repartió el gasto.
 *
 * ── Por qué una dona y no barras ────────────────────────────────────────────
 * Porque la pregunta es de PROPORCIÓN, no de ranking: cuánto se lleva cada
 * centro DEL TOTAL. Una fila de barras compara unas con otras y deja el total
 * implícito; la dona lo pone en el centro y cada porción se lee contra él sin
 * hacer ninguna cuenta.
 */
export function Distribution({
  rows,
  level,
  parent,
  totalSpent,
  path,
  onDrillDown,
  onDrillUp,
}: DistributionProps) {
  const total = Number.parseFloat(totalSpent) || 0;
  const [isList, setIsList] = useState(true);

  return (
    <Card className="h-full min-h-0">
      <CardContent className="flex h-full flex-col p-4 sm:p-6">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-lg font-semibold">
            {t('transactions.distribution.title')}
          </h2>
          <ShowNames isList={isList} onToggle={() => setIsList((wasList) => !wasList)} />
        </div>

        {/* Bajar de nivel es un clic; subir tiene que serlo también. Sin esto,
            entrar en un centro de costos era un viaje de ida: la única salida
            era limpiar el filtro entero desde la barra de arriba. */}
        {path.length > 0 ? (
          <div className="flex min-w-0 self-start">
            <BackCrumb path={path.map((n) => n.name)} onBack={onDrillUp} />
          </div>
        ) : (
          /* El NOMBRE de a quién pertenecen estas filas, no el nivel al que
             están. "Por categoría" no dice de qué: las categorías de cuál centro. */
          <p className="truncate text-xs text-muted-foreground">
            {parent?.name ?? t('transactions.distribution.byLevel', { level })}
          </p>
        )}

        {/* `flex-1` para que la dona tenga contra qué medir: la tarjeta ya
            tiene alto —se lo dio la fila— y este es el trozo que le queda. */}
        <Donut
          className="mt-6 min-h-0 flex-1"
          isListVisible={isList}
          total={total}
          portions={rows.map((f) => ({
            id: f.categoryId,
            name: f.name,
            value: Number.parseFloat(f.total) || 0,
          }))}
          onSelect={level === 'concepto' ? undefined : onDrillDown}
        />
      </CardContent>
    </Card>
  );
}

/* Esconder los nombres no cambia el ancho de la tarjeta: lo fija la
    rejilla del resumen, no lo que haya dentro. */
/* Mismo botón que los de la barra de filtros: la variante
    `herramienta` y el tamaño `chip-icon`. Un control que hace lo
    mismo —encender y apagar algo de la vista— tiene que verse igual
    en las dos pantallas. */
function ShowNames({ isList, onToggle }: { isList: boolean; onToggle: () => void }) {
  return (
    <Button
      type="button"
      variant="tool"
      size="sm-icon"
      aria-pressed={!isList}
      aria-label={
        isList ? t('transactions.distribution.hideNames') : t('transactions.distribution.showNames')
      }
      title={
        isList ? t('transactions.distribution.hideNames') : t('transactions.distribution.showNames')
      }
      onClick={onToggle}
    >
      {isList ? (
        <Eye className="size-4" aria-hidden="true" />
      ) : (
        <EyeOff className="size-4" aria-hidden="true" />
      )}
    </Button>
  );
}
