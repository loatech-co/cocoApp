import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';

import { Casilla } from '@/components/ui/casilla';
import { cn } from '@/lib/utils';
import type { Category } from '@coco/types';

/**
 * El filtro por centros de costos, grupos y conceptos.
 *
 * ── Por qué casillas y no una lista de una sola elección ────────────────────
 * Porque la pregunta habitual no es "¿cuánto me cuesta Casa?" sino "¿cuánto me
 * cuestan Casa y Transporte juntos?". Con una sola elección hay que mirar dos
 * veces y sumar a mano.
 *
 * ── Por qué marcar y bajar de nivel son dos gestos distintos ────────────────
 * Antes eran el mismo: elegir un centro lo filtraba y además mostraba sus
 * grupos. Con casillas eso deja de funcionar —marcar tres centros movería la
 * lista tres veces— así que la casilla marca y la flecha baja. Cada gesto hace
 * una cosa y solo una.
 *
 * ── Por qué el camino es una línea y no migas sueltas ───────────────────────
 * Porque el panel mide 18rem: tres botones con separadores se parten en dos
 * renglones al segundo nivel. Una sola línea con la flecha de volver dice lo
 * mismo, siempre ocupa el mismo alto y tiene un solo sitio donde pulsar.
 */
export function FiltroClasificacion({
  arbol,
  marcados,
  onCambiar,
}: {
  arbol: Category[];
  marcados: number[];
  onCambiar: (ids: number[]) => void;
}) {
  /**
   * El camino hasta el nivel que se está listando. Vacío = los centros.
   *
   * Vive aquí y no en la URL porque es NAVEGACIÓN, no recorte: dos personas
   * con el mismo filtro pueden estar mirando niveles distintos del panel, y
   * eso no cambia lo que ve ninguna de las dos en la pantalla de atrás.
   */
  const [camino, setCamino] = useState<Category[]>([]);

  const actual = camino[camino.length - 1];
  const lista = actual ? (actual.children ?? []) : arbol;

  const alternar = (id: number): void => {
    onCambiar(marcados.includes(id) ? marcados.filter((n) => n !== id) : [...marcados, id]);
  };

  /** Marcado por debajo: el padre lo dice sin afirmar que lo está él. */
  const tieneMarcadoDentro = (nodo: Category): boolean =>
    (nodo.children ?? []).some(
      (hijo) => marcados.includes(hijo.id) || tieneMarcadoDentro(hijo),
    );

  return (
    <div className="flex flex-col">
      <div className="flex min-h-9 items-center gap-1 px-3 py-1.5">
        {camino.length > 0 ? (
          <button
            type="button"
            onClick={() => setCamino(camino.slice(0, -1))}
            className="flex min-w-0 items-center gap-1 rounded-md text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{camino.map((n) => n.name).join(' · ')}</span>
          </button>
        ) : (
          <span className="text-xs font-semibold text-muted-foreground">Centros de costos</span>
        )}
      </div>

      {/* Alto limitado: un centro con cuarenta conceptos haría un menú más
          largo que la pantalla y sin forma de llegar al pie. */}
      <ul className="max-h-64 overflow-y-auto border-y border-border py-1">
        {lista.length === 0 ? (
          <li className="px-3 py-2 text-sm text-muted-foreground">Nada que desglosar aquí.</li>
        ) : (
          lista.map((nodo) => {
            const hijos = nodo.children ?? [];
            const marcado = marcados.includes(nodo.id);

            return (
              <li key={nodo.id} className="flex items-stretch">
                <label
                  className={cn(
                    'flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 py-2 pl-3 pr-2 text-sm transition-colors',
                    // La FILA es el control: el recuadro de 16 es una segunda
                    // forma, más pequeña, de dar a un blanco que ya es todo el
                    // ancho del desplegable. Por eso la fila tiene suelo y el
                    // recuadro no.
                    'movil:min-h-[42px]',
                    'hover:bg-accent hover:text-accent-foreground',
                    marcado && 'font-medium',
                  )}
                >
                  <Casilla checked={marcado} onChange={() => alternar(nodo.id)} />
                  <span className="min-w-0 flex-1 truncate">{nodo.name}</span>
                  {!marcado && tieneMarcadoDentro(nodo) && (
                    <span
                      aria-hidden="true"
                      title="Hay algo marcado dentro"
                      className="size-1.5 shrink-0 rounded-full bg-primary"
                    />
                  )}
                </label>

                {hijos.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setCamino([...camino, nodo])}
                    aria-label={`Ver lo que hay dentro de ${nodo.name}`}
                    title={`Ver lo que hay dentro de ${nodo.name}`}
                    className="grid w-9 shrink-0 place-items-center text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    <ChevronRight className="size-4" aria-hidden="true" />
                  </button>
                )}
              </li>
            );
          })
        )}
      </ul>

      <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
        <span className="text-muted-foreground">
          {marcados.length === 0
            ? 'Sin filtrar'
            : `${marcados.length} ${marcados.length === 1 ? 'marcado' : 'marcados'}`}
        </span>
        {marcados.length > 0 && (
          <button
            type="button"
            onClick={() => onCambiar([])}
            className="rounded-sm font-medium text-primary hover:underline"
          >
            Limpiar
          </button>
        )}
      </div>
    </div>
  );
}
