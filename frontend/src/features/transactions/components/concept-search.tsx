import { ChevronDown } from 'lucide-react';
import { useEffect, useRef, type RefObject } from 'react';

import { useConceptSearch } from '@/features/transactions/hooks/use-concept-search';
import type { ReceiptCandidate } from '@/features/transactions/model/movement-form';
import { t } from '@/shared/lib/i18n';
import type { TreeNode } from '@/shared/lib/searchable-tree';
import { cn } from '@/shared/lib/utils';
import { Field } from '@/shared/ui/atoms/field';
import { SearchBox } from '@/shared/ui/atoms/search-box';
import { fieldTrigger, useInsideField } from '@/shared/ui/foundations/field';
import { Menu } from '@/shared/ui/molecules/menu';
import { readablePath, type IndexEntry } from '@coco/receipt-parser';

import { CategoryForNew, SearchResults, type ResultsProps } from './concept-search-lists';

interface ConceptSearchProps {
  id: string;
  tree: readonly TreeNode[];
  /** El id elegido: un concepto o una categoría. */
  value: number | undefined;
  onSelect: (id: number | undefined) => void;
  /** Crear un concepto con ese nombre dentro de esa categoría, y elegirlo. */
  onCreateConcept: (name: string, categoryId: number) => void;
  isCreating?: boolean;
  /** En un centro estático: se enseña lo elegido, pero no se cambia desde aquí. */
  disabled?: boolean;
  /** Ids de los conceptos usados últimamente, del más reciente al más viejo. */
  recent?: readonly number[];
  /** Lo que la lectura de un recibo dejó entre lo que dudar. */
  candidates?: readonly ReceiptCandidate[];
  /** Debajo del campo: «sugerido por tu historial», un error… */
  description?: string | undefined;
}

/**
 * Un solo buscador para clasificar un movimiento.
 *
 * ── El problema que resuelve ────────────────────────────────────────────────
 * Clasificar pedía tres desplegables en cascada —centro, categoría, concepto—
 * y siete interacciones para dejar un gasto bien puesto. Aquí se escribe «d1»
 * y aparece «Mercado · Alimentación › Costos variables»: un clic, y los tres
 * niveles quedan puestos, porque elegir un concepto ya dice de qué categoría y
 * de qué centro es.
 *
 * ── Qué se busca ────────────────────────────────────────────────────────────
 * Conceptos y categorías, por nombre y por palabra clave, sin tildes ni
 * mayúsculas. Cada resultado enseña su camino, que es lo que distingue dos
 * «Mercado». Elegir una categoría también vale: hay cuentas con categorías y
 * sin conceptos, y ahí la categoría es lo más fino que se puede decir.
 *
 * ── Con el buscador en blanco ───────────────────────────────────────────────
 * Lo que la persona usó últimamente, hasta cinco. Casi todos los gastos de
 * alguien van a los mismos cinco conceptos, y tenerlos delante es cero
 * teclas. Si la lectura de un recibo dejó candidatos entre los que dudar,
 * esos van primero: son la pregunta que la pantalla está haciendo.
 *
 * ── Cuando no hay nada ──────────────────────────────────────────────────────
 * Se ofrece crear el concepto con lo escrito. Como un concepto cuelga de una
 * categoría, se pregunta solo eso: en qué categoría va. Un centro de costos
 * nunca se crea desde aquí —es la estructura de arriba, y se define tres
 * veces en la vida de una cuenta—.
 *
 * ── Sobre `Menu`, como todo desplegable de esta aplicación ──────────────────
 * Es el que sabe abrir, cerrar al tocar fuera, cerrar con Escape y colocarse.
 * La fila elegible es la misma `Opcion` de `Combo`, para que elegir se vea
 * igual en los dos sitios.
 */
export function ConceptSearch({
  id,
  tree,
  value,
  onSelect,
  onCreateConcept,
  isCreating = false,
  disabled: isDisabled = false,
  recent = [],
  candidates = [],
  description,
}: ConceptSearchProps) {
  const b = useConceptSearch({ tree, value, recent });
  const field = useRef<HTMLInputElement>(null);

  if (isDisabled) {
    return (
      <Field label={t('transactions.fields.concept')} id={id} description={description}>
        <LockedConcept id={id} chosen={b.chosen} />
      </Field>
    );
  }

  return (
    <Field label={t('transactions.fields.concept')} id={id} description={description}>
      <Menu
        label={t('transactions.fields.concept')}
        kind="search"
        align="left"
        isFloating
        isUnpadded
        boxClassName="w-full min-w-0"
        triggerClassName={fieldTrigger()}
        triggerId={id}
        trigger={({ isOpen }) => <ConceptSearchValue chosen={b.chosen} isOpen={isOpen} />}
      >
        {(close) => (
          <MenuPanel
            searchBox={b}
            field={field}
            candidates={candidates}
            isCreating={isCreating}
            close={close}
            onSelect={onSelect}
            onCreateConcept={onCreateConcept}
          />
        )}
      </Menu>
    </Field>
  );
}

interface MenuPanelProps {
  searchBox: ReturnType<typeof useConceptSearch>;
  field: RefObject<HTMLInputElement | null>;
  candidates: readonly ReceiptCandidate[];
  isCreating: boolean;
  close: () => void;
  onSelect: (id: number | undefined) => void;
  onCreateConcept: (name: string, categoryId: number) => void;
}

/** El panel abierto, con lo que hay que hacer al elegir: limpiar y cerrar. */
function MenuPanel({
  searchBox: b,
  field,
  candidates,
  isCreating,
  close,
  onSelect,
  onCreateConcept,
}: MenuPanelProps) {
  const finish = (): void => {
    b.clear();
    close();
  };

  return (
    <Panel
      field={field}
      query={b.query}
      setQuery={b.setQuery}
      mode={b.mode}
      results={b.results}
      recent={b.recentEntries}
      candidates={candidates}
      categories={b.filteredCategories}
      chosen={b.chosen}
      canCreate={b.canCreate}
      isCreating={isCreating}
      onSelect={(e) => {
        onSelect(e === undefined ? undefined : Number(e.id));
        finish();
      }}
      onSelectCandidate={(c) => {
        onSelect(c.id);
        finish();
      }}
      newName={b.newName}
      onRequestCategory={b.askForCategory}
      onBack={b.back}
      onCreateIn={(category) => {
        onCreateConcept(b.newName, Number(category.id));
        finish();
      }}
    />
  );
}

/** En un centro estático: lo elegido se enseña, pero no abre nada. */
function LockedConcept({ id, chosen }: { id: string; chosen: IndexEntry | undefined }) {
  return (
    <span
      id={id}
      aria-disabled="true"
      className={cn(fieldTrigger(), 'cursor-not-allowed opacity-50')}
    >
      <ConceptSearchValue chosen={chosen} isOpen={false} />
    </span>
  );
}

/*
  Lo que se ve en el campo, abierto o cerrado, se pueda tocar o no.

  Uno y no dos, como en `Combo`: bloqueado quiere decir «esto no se cambia
  desde aquí», nunca «esto está vacío». Un movimiento de un centro estático
  tiene que leerse clasificado aunque no se pueda reclasificar.
*/
function ConceptSearchValue({
  chosen,
  isOpen,
}: {
  chosen: IndexEntry | undefined;
  isOpen: boolean;
}) {
  const isInField = useInsideField();
  return (
    <>
      <span
        data-lleno={chosen ? 'si' : 'no'}
        data-vacio={chosen ? undefined : ''}
        className={cn(
          'flex min-w-0 flex-1 items-baseline gap-2 text-left',
          !chosen && 'text-muted-foreground',
          isInField && 'pt-4',
        )}
      >
        <span className="truncate">
          {chosen?.name ?? t('transactions.conceptSearch.placeholder')}
        </span>
        {chosen && chosen.path.length > 0 && (
          <span className="hidden truncate text-xs text-muted-foreground sm:inline">
            {readablePath(chosen)}
          </span>
        )}
      </span>
      <ChevronDown
        className={cn('size-4 shrink-0 opacity-60 transition-transform', isOpen && 'rotate-180')}
        aria-hidden="true"
      />
    </>
  );
}

interface PanelProps extends ResultsProps {
  field: RefObject<HTMLInputElement | null>;
  setQuery: (v: string) => void;
  mode: 'buscar' | 'categoria-para-nuevo';
  categories: IndexEntry[];
  newName: string;
  onBack: () => void;
  onCreateIn: (category: IndexEntry) => void;
}

function Panel(props: PanelProps) {
  const { field, mode } = props;

  // El foco al abrir: es un buscador que aparece porque se pidió buscar, la
  // excepción que la regla del foco contempla. Si hubiera que pulsar el campo
  // antes de escribir, el gesto serían dos clics.
  useEffect(() => {
    const t = setTimeout(() => field.current?.focus(), 10);
    return () => clearTimeout(t);
  }, [field, mode]);

  return (
    <div className="flex flex-col">
      <ConceptSearchBox {...props} />

      {mode === 'categoria-para-nuevo' ? (
        <CategoryForNew
          newName={props.newName}
          categories={props.categories}
          onBack={props.onBack}
          onCreateIn={props.onCreateIn}
        />
      ) : (
        <SearchResults {...props} />
      )}
    </div>
  );
}

function ConceptSearchBox(props: PanelProps) {
  const { field, query, setQuery, categories, results, canCreate } = props;
  const isChoosingCategory = props.mode === 'categoria-para-nuevo';

  return (
    <SearchBox
      shape="header"
      ref={field}
      value={query}
      onChange={(e) => setQuery(e.target.value)}
      onKeyDown={(e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        if (isChoosingCategory) {
          const [isOnly] = categories;
          if (categories.length === 1 && isOnly !== undefined) props.onCreateIn(isOnly);
          return;
        }
        // Enter elige lo único que queda, que es lo que uno espera después
        // de escribir tres letras y ver una sola fila. Sin filas, pasa a crear.
        if (results.length === 1) props.onSelect(results[0]);
        else if (results.length === 0 && canCreate) props.onRequestCategory();
      }}
      placeholder={
        isChoosingCategory
          ? t('transactions.conceptSearch.filterCategoriesPlaceholder')
          : t('transactions.conceptSearch.searchPlaceholder')
      }
      aria-label={
        isChoosingCategory
          ? t('transactions.conceptSearch.filterCategories')
          : t('transactions.conceptSearch.placeholder')
      }
    />
  );
}
