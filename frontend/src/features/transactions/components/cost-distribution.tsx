import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/shared/ui/atoms/button';
import { Card, CardContent } from '@/shared/ui/atoms/card';
import { Dona } from '@/shared/ui/atoms/dona';
import { BackCrumb } from '@/shared/ui/atoms/level-nav';

interface PropsDeDistribucion {
  filas: { categoryId: number | null; name: string; total: string; count: number }[];
  nivel: string;
  /** De quién son las filas. `null` cuando son los centros de costos. */
  padre: { id: number; name: string } | null;
  totalGastado: string;
  /** El camino hasta donde se bajó. Vacío = se está en los centros de costos. */
  ruta: { id: number; name: string }[];
  onBajar: (id: number) => void;
  onSubir: () => void;
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
export function Distribucion({
  filas,
  nivel,
  padre,
  totalGastado,
  ruta,
  onBajar,
  onSubir,
}: PropsDeDistribucion) {
  const total = Number.parseFloat(totalGastado) || 0;
  const [verLista, setVerLista] = useState(true);

  return (
    <Card className="h-full min-h-0">
      <CardContent className="flex h-full flex-col p-4 sm:p-6">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-lg font-semibold">Distribución de costos</h2>
          <VerNombres verLista={verLista} onAlternar={() => setVerLista((v) => !v)} />
        </div>

        {/* Bajar de nivel es un clic; subir tiene que serlo también. Sin esto,
            entrar en un centro de costos era un viaje de ida: la única salida
            era limpiar el filtro entero desde la barra de arriba. */}
        {ruta.length > 0 ? (
          <div className="flex min-w-0 self-start">
            <BackCrumb ruta={ruta.map((n) => n.name)} onVolver={onSubir} />
          </div>
        ) : (
          /* El NOMBRE de a quién pertenecen estas filas, no el nivel al que
             están. "Por categoría" no dice de qué: las categorías de cuál centro. */
          <p className="truncate text-xs text-muted-foreground">{padre?.name ?? `Por ${nivel}`}</p>
        )}

        {/* `flex-1` para que la dona tenga contra qué medir: la tarjeta ya
            tiene alto —se lo dio la fila— y este es el trozo que le queda. */}
        <Dona
          className="mt-6 min-h-0 flex-1"
          mostrarLista={verLista}
          total={total}
          porciones={filas.map((f) => ({
            id: f.categoryId,
            nombre: f.name,
            valor: Number.parseFloat(f.total) || 0,
          }))}
          onElegir={nivel === 'concepto' ? undefined : onBajar}
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
function VerNombres({ verLista, onAlternar }: { verLista: boolean; onAlternar: () => void }) {
  return (
    <Button
      type="button"
      variant="herramienta"
      size="sm-icon"
      aria-pressed={!verLista}
      aria-label={verLista ? 'Ocultar los nombres' : 'Mostrar los nombres'}
      title={verLista ? 'Ocultar los nombres' : 'Mostrar los nombres'}
      onClick={onAlternar}
    >
      {verLista ? (
        <Eye className="size-4" aria-hidden="true" />
      ) : (
        <EyeOff className="size-4" aria-hidden="true" />
      )}
    </Button>
  );
}
