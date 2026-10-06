import { useState } from 'react';

import { type CategoryTree } from '@/shared/api/categories';
import { t } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { Checkbox } from '@/shared/ui/atoms/checkbox';
import { BackCrumb, DrillButton } from '@/shared/ui/atoms/level-nav';
import { TextButton } from '@/shared/ui/atoms/text-button';
import { REALCE } from '@/shared/ui/foundations/superficie';

/**
 * El filtro por centros de costos, categorías y conceptos.
 *
 * ── Por qué casillas y no una lista de una sola elección ────────────────────
 * Porque la pregunta habitual no es "¿cuánto me cuesta Casa?" sino "¿cuánto me
 * cuestan Casa y Transporte juntos?". Con una sola elección hay que mirar dos
 * veces y sumar a mano.
 *
 * ── Por qué marcar y bajar de nivel son dos gestos distintos ────────────────
 * Antes eran el mismo: elegir un centro lo filtraba y además mostraba sus
 * categorías. Con casillas eso deja de funcionar —marcar tres centros movería la
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
  arbol: CategoryTree[];
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
  const [camino, setCamino] = useState<CategoryTree[]>([]);

  const actual = camino[camino.length - 1];
  const lista = actual ? (actual.children ?? []) : arbol;

  const alternar = (id: number): void => {
    onCambiar(marcados.includes(id) ? marcados.filter((n) => n !== id) : [...marcados, id]);
  };

  /** Marcado por debajo: el padre lo dice sin afirmar que lo está él. */
  const tieneMarcadoDentro = (nodo: CategoryTree): boolean =>
    (nodo.children ?? []).some((hijo) => marcados.includes(hijo.id) || tieneMarcadoDentro(hijo));

  return (
    <div className="flex flex-col">
      <FilterPath camino={camino} onVolver={() => setCamino(camino.slice(0, -1))} />

      {/* Alto limitado: un centro con cuarenta conceptos haría un menú más
          largo que la pantalla y sin forma de llegar al pie. */}
      <ul className="max-h-64 overflow-y-auto border-y border-border py-1">
        {lista.length === 0 ? (
          <li className="px-3 py-2 text-sm text-muted-foreground">
            {t('transactions.classificationFilter.nothingToExpand')}
          </li>
        ) : (
          lista.map((nodo) => {
            const marcado = marcados.includes(nodo.id);

            return (
              <FilterRow
                key={nodo.id}
                nodo={nodo}
                marcado={marcado}
                conMarcaDentro={!marcado && tieneMarcadoDentro(nodo)}
                onAlternar={() => alternar(nodo.id)}
                onEntrar={() => setCamino([...camino, nodo])}
              />
            );
          })
        )}
      </ul>

      <FilterFooter marcados={marcados} onLimpiar={() => onCambiar([])} />
    </div>
  );
}

function FilterFooter({ marcados, onLimpiar }: { marcados: number[]; onLimpiar: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
      <span className="text-muted-foreground">
        {marcados.length === 0
          ? t('transactions.classificationFilter.unfiltered')
          : marcados.length === 1
            ? t('transactions.classificationFilter.markedOne', { n: marcados.length })
            : t('transactions.classificationFilter.markedMany', { n: marcados.length })}
      </span>
      {marcados.length > 0 && (
        <TextButton tone="primary" onClick={onLimpiar}>
          {t('transactions.classificationFilter.clear')}
        </TextButton>
      )}
    </div>
  );
}

interface FilterRowProps {
  nodo: CategoryTree;
  marcado: boolean;
  /** Hay algo marcado más abajo: lo dice un punto. */
  conMarcaDentro: boolean;
  onAlternar: () => void;
  onEntrar: () => void;
}

/** Una fila: la casilla con su nombre, y la flecha para bajar un nivel. */
function FilterRow({ nodo, marcado, conMarcaDentro, onAlternar, onEntrar }: FilterRowProps) {
  const hijos = nodo.children ?? [];
  return (
    <li className="flex items-stretch">
      <label
        className={cn(
          'flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 py-2 pl-3 pr-2 text-sm transition-colors',
          // La FILA es el control: el recuadro de 16 es una segunda
          // forma, más pequeña, de dar a un blanco que ya es todo el
          // ancho del desplegable. Por eso la fila tiene suelo y el
          // recuadro no.
          'movil:min-h-[42px]',
          REALCE,
          marcado && 'font-medium',
        )}
      >
        <Checkbox checked={marcado} onChange={onAlternar} />
        <span className="min-w-0 flex-1 truncate">{nodo.name}</span>
        {conMarcaDentro && (
          <span
            aria-hidden="true"
            title={t('transactions.classificationFilter.somethingMarked')}
            className="size-1.5 shrink-0 rounded-full bg-primary"
          />
        )}
      </label>

      {hijos.length > 0 && <DrillButton name={nodo.name} onDrill={onEntrar} />}
    </li>
  );
}

/** Dónde se está: los niveles recorridos, y la vuelta al de arriba. */
function FilterPath({ camino, onVolver }: { camino: CategoryTree[]; onVolver: () => void }) {
  return (
    <div className="flex min-h-9 items-center gap-1 px-3 py-1.5">
      {camino.length > 0 ? (
        <BackCrumb path={camino.map((n) => n.name)} isStrong onBack={onVolver} />
      ) : (
        <span className="text-xs font-semibold text-muted-foreground">
          {t('shell.sections.costCenters')}
        </span>
      )}
    </div>
  );
}
