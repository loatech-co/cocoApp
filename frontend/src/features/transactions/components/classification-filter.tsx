import { useState } from 'react';

import { type CategoryTree } from '@/shared/api/categories';
import { t } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { Checkbox } from '@/shared/ui/atoms/checkbox';
import { BackCrumb, DrillButton } from '@/shared/ui/atoms/level-nav';
import { TextButton } from '@/shared/ui/atoms/text-button';
import { HIGHLIGHT } from '@/shared/ui/foundations/surface';

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
export function ClassificationFilter({
  tree,
  checked,
  onChange,
}: {
  tree: CategoryTree[];
  checked: number[];
  onChange: (ids: number[]) => void;
}) {
  /**
   * El camino hasta el nivel que se está listando. Vacío = los centros.
   *
   * Vive aquí y no en la URL porque es NAVEGACIÓN, no recorte: dos personas
   * con el mismo filtro pueden estar mirando niveles distintos del panel, y
   * eso no cambia lo que ve ninguna de las dos en la pantalla de atrás.
   */
  const [path, setPath] = useState<CategoryTree[]>([]);

  const actual = path[path.length - 1];
  const list = actual ? (actual.children ?? []) : tree;

  const toggle = (id: number): void => {
    onChange(checked.includes(id) ? checked.filter((n) => n !== id) : [...checked, id]);
  };

  /** Marcado por debajo: el padre lo dice sin afirmar que lo está él. */
  const hasCheckedInside = (node: CategoryTree): boolean =>
    (node.children ?? []).some((child) => checked.includes(child.id) || hasCheckedInside(child));

  return (
    <div className="flex flex-col">
      <FilterPath path={path} onBack={() => setPath(path.slice(0, -1))} />

      {/* Alto limitado: un centro con cuarenta conceptos haría un menú más
          largo que la pantalla y sin forma de llegar al pie. */}
      <ul className="max-h-64 overflow-y-auto border-y border-border py-1">
        {list.length === 0 ? (
          <li className="px-3 py-2 text-sm text-muted-foreground">
            {t('transactions.classificationFilter.nothingToExpand')}
          </li>
        ) : (
          list.map((node) => {
            const isChecked = checked.includes(node.id);

            return (
              <FilterRow
                key={node.id}
                node={node}
                isChecked={isChecked}
                hasCheckedInside={!isChecked && hasCheckedInside(node)}
                onToggle={() => toggle(node.id)}
                onEnter={() => setPath([...path, node])}
              />
            );
          })
        )}
      </ul>

      <FilterFooter checked={checked} onClear={() => onChange([])} />
    </div>
  );
}

function FilterFooter({ checked, onClear }: { checked: number[]; onClear: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
      <span className="text-muted-foreground">
        {checked.length === 0
          ? t('transactions.classificationFilter.unfiltered')
          : checked.length === 1
            ? t('transactions.classificationFilter.markedOne', { n: checked.length })
            : t('transactions.classificationFilter.markedMany', { n: checked.length })}
      </span>
      {checked.length > 0 && (
        <TextButton tone="primary" onClick={onClear}>
          {t('transactions.classificationFilter.clear')}
        </TextButton>
      )}
    </div>
  );
}

interface FilterRowProps {
  node: CategoryTree;
  isChecked: boolean;
  /** Hay algo marcado más abajo: lo dice un punto. */
  hasCheckedInside: boolean;
  onToggle: () => void;
  onEnter: () => void;
}

/** Una fila: la casilla con su nombre, y la flecha para bajar un nivel. */
function FilterRow({ node, isChecked, hasCheckedInside, onToggle, onEnter }: FilterRowProps) {
  const children = node.children ?? [];
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
          HIGHLIGHT,
          isChecked && 'font-medium',
        )}
      >
        <Checkbox checked={isChecked} onChange={onToggle} />
        <span className="min-w-0 flex-1 truncate">{node.name}</span>
        {hasCheckedInside && (
          <span
            aria-hidden="true"
            title={t('transactions.classificationFilter.somethingMarked')}
            className="size-1.5 shrink-0 rounded-full bg-primary"
          />
        )}
      </label>

      {children.length > 0 && <DrillButton name={node.name} onDrill={onEnter} />}
    </li>
  );
}

/** Dónde se está: los niveles recorridos, y la vuelta al de arriba. */
function FilterPath({ path, onBack }: { path: CategoryTree[]; onBack: () => void }) {
  return (
    <div className="flex min-h-9 items-center gap-1 px-3 py-1.5">
      {path.length > 0 ? (
        <BackCrumb path={path.map((n) => n.name)} isStrong onBack={onBack} />
      ) : (
        <span className="text-xs font-semibold text-muted-foreground">
          {t('shell.sections.costCenters')}
        </span>
      )}
    </div>
  );
}
