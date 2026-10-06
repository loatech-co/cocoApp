import { Check, ChevronDown, CornerDownLeft, Plus } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { t } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { SearchBox } from '@/shared/ui/atoms/search-box';
import { fieldTrigger, useInsideField } from '@/shared/ui/foundations/field';
import { HIGHLIGHT } from '@/shared/ui/foundations/surface';
import { Menu } from '@/shared/ui/molecules/menu';

/**
 * Un desplegable en el que se escribe.
 *
 * ── Por qué no basta con el `Select` ────────────────────────────────────────
 * Porque una lista de cuarenta conceptos no se recorre con la rueda del ratón.
 * Escribiendo tres letras queda uno, y ese es el gesto con el que todo el
 * mundo busca desde hace veinte años. El `Select` sigue siendo el correcto
 * donde las opciones son cinco y caben de un vistazo.
 *
 * ── Por qué "crear" vive aquí dentro ────────────────────────────────────────
 * Porque el momento en que uno descubre que un concepto no existe es
 * exactamente el momento en que lo está buscando. Mandarlo a otra pantalla a
 * crearlo —y a volver, y a buscar otra vez— es donde se abandona la tarea.
 *
 * Y es OPCIONAL a propósito: en los centros de costos no se ofrece. Un centro
 * es la estructura de arriba, se define tres veces en la vida de una cuenta, y
 * poder inventar uno al vuelo mientras se registra un gasto es como acaban las
 * cuentas con "Casa", "casa" y "Hogar" siendo lo mismo.
 *
 * ── Ningún control del sistema operativo ────────────────────────────────────
 * Se construye sobre `menu.tsx`, como todo lo que se despliega en esta app: es
 * el que sabe cerrarse al tocar fuera, con Escape, y salirse de la caja que lo
 * contiene cuando el modal tiene desplazamiento.
 */

interface ComboOption {
  value: string;
  label: string;
}

interface ComboProps {
  /** Nombre accesible. No se pinta: la etiqueta visible va fuera. */
  label: string;
  /** El valor elegido. `''` es ninguno. */
  value: string;
  options: ComboOption[];
  onChange: (value: string) => void;
  /** Si se pasa, se ofrece crear lo que no exista. */
  onCreate?: (name: string) => void;
  emptyLabel?: string;
  disabled?: boolean;
  /** Mientras se crea, para no dejar pulsar dos veces. */
  isCreating?: boolean;
  id?: string;
}

export function Combo({
  label,
  value,
  options,
  onChange,
  onCreate,
  emptyLabel = t('ui.combo.notChosen'),
  disabled: isDisabled = false,
  isCreating = false,
  id,
}: ComboProps) {
  const search = useComboSearch(options, onChange, onCreate);
  const inputRef = useRef<HTMLInputElement>(null);
  const isInField = useInsideField();

  const selected = options.find((o) => o.value === value);

  /*
    Lo que se ve en el campo, abierto o cerrado, se pueda tocar o no.

    ── Por qué es UNO y no dos ─────────────────────────────────────────────
    Estaba escrito dos veces, y las dos copias decían cosas distintas: la del
    control bloqueado pintaba SIEMPRE el marcador e ignoraba lo elegido. En la
    ficha de un movimiento de un centro estático —donde los tres desplegables
    salen bloqueados a propósito, porque esa clasificación no se toca desde
    aquí— eso significaba abrir un movimiento bien clasificado y leer «Elige
    una opción» en centro, categoría y concepto. El formulario decía que no estaba
    clasificado, que es exactamente lo contrario de lo que pasaba.

    Bloqueado quiere decir «esto no se cambia desde aquí», nunca «esto está
    vacío». Es la misma forma que ya tenía `Select`, que sí reutilizaba su
    contenido.
  */
  const triggerContent = (isOpen: boolean) => (
    <ComboTriggerContent
      selected={selected}
      emptyLabel={emptyLabel}
      isInField={isInField}
      isOpen={isOpen}
    />
  );

  // Bloqueado no puede ser un botón que abre nada: se pinta igual pero sin
  // desplegable detrás, para que el foco no caiga en una trampa.
  if (isDisabled) return <DisabledCombo id={id}>{triggerContent(false)}</DisabledCombo>;

  return (
    <Menu
      label={label}
      kind="list"
      align="left"
      isFloating
      // El panel dibuja sus propias franjas a sangre —el buscador arriba, el
      // "crear" abajo—: con el acolchado del menú, esas líneas quedarían
      // cortadas 4px antes de cada lado.
      isUnpadded
      boxClassName="w-full min-w-0"
      triggerClassName={fieldTrigger()}
      triggerId={id}
      trigger={({ isOpen }) => triggerContent(isOpen)}
    >
      {(close) => (
        <ComboPanel
          inputRef={inputRef}
          search={search}
          value={value}
          emptyLabel={emptyLabel}
          isCreating={isCreating}
          close={close}
        />
      )}
    </Menu>
  );
}

interface ComboSearch {
  query: string;
  setQuery: (v: string) => void;
  filtered: ComboOption[];
  canCreate: boolean;
  /** Elige una opción y vacía el buscador. */
  select: (value: string) => void;
  /** Crea lo escrito y vacía el buscador. */
  create: () => void;
}

/** Lo escrito en el buscador, lo que deja ver y lo que se puede crear con ello. */
function useComboSearch(
  options: ComboOption[],
  onChange: (value: string) => void,
  onCreate: ((name: string) => void) | undefined,
): ComboSearch {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = normal(query);
    if (q === '') return options;
    return options.filter((o) => normal(o.label).includes(q));
  }, [options, query]);

  // Ofrecer crear solo cuando lo escrito no existe ya. Con un nombre que
  // coincide, "crear" produciría dos conceptos idénticos —y a partir de ahí
  // la misma plata sumando por separado en los dos—.
  const canCreate =
    onCreate !== undefined &&
    query.trim() !== '' &&
    !options.some((o) => normal(o.label) === normal(query));

  return {
    query,
    setQuery,
    filtered,
    canCreate,
    select: (v) => {
      onChange(v);
      setQuery('');
    },
    create: () => {
      onCreate?.(query.trim());
      setQuery('');
    },
  };
}

interface ComboPanelProps {
  inputRef: React.RefObject<HTMLInputElement | null>;
  search: ComboSearch;
  value: string;
  emptyLabel: string;
  isCreating: boolean;
  close: () => void;
}

function ComboPanel({ inputRef, search, value, emptyLabel, isCreating, close }: ComboPanelProps) {
  const { query, setQuery, filtered, canCreate } = search;

  // El foco al abrir: si hay que pulsar el campo antes de escribir, el gesto
  // son dos clics y nadie llega a descubrir que se podía filtrar.
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 10);
    return () => clearTimeout(t);
  }, [inputRef]);

  function onSelect(v: string): void {
    search.select(v);
    close();
  }

  function onCreate(): void {
    search.create();
    close();
  }

  return (
    <div className="flex flex-col">
      <SearchBox
        shape="header"
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          // Enter elige lo único que queda, que es lo que uno espera después
          // de escribir tres letras y ver una sola fila.
          if (e.key !== 'Enter') return;
          e.preventDefault();
          const [only] = filtered;
          if (filtered.length === 1 && only !== undefined) onSelect(only.value);
          else if (canCreate) onCreate();
        }}
        placeholder={t('ui.combo.search')}
      />

      <ComboOptions
        filtered={filtered}
        value={value}
        emptyLabel={emptyLabel}
        canCreate={canCreate}
        onSelect={onSelect}
      />

      {canCreate && (
        <CreateOption isCreating={isCreating} onCreate={onCreate}>
          {t('ui.combo.create', { name: query.trim() })}
        </CreateOption>
      )}
    </div>
  );
}

/**
 * La fila de «crear lo que falta», al pie de una lista con buscador.
 *
 * Exportada porque el buscador de conceptos ofrece lo mismo: dos copias se
 * separan. `conIntro` añade la pista de que Intro la elige, cuando es lo único
 * que se puede elegir.
 */
export function CreateOption({
  isCreating,
  hasEnterHint = false,
  onCreate,
  children,
}: {
  isCreating: boolean;
  hasEnterHint?: boolean;
  onCreate: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onCreate}
      disabled={isCreating}
      className={cn(
        'flex w-full items-center gap-2 border-t border-border px-3 py-2.5 text-left text-sm',
        'font-medium transition-colors',
        HIGHLIGHT,
        'disabled:opacity-60',
      )}
    >
      <Plus className="size-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 truncate">{children}</span>
      {hasEnterHint && (
        <CornerDownLeft className="ml-auto size-3.5 shrink-0 opacity-50" aria-hidden="true" />
      )}
    </button>
  );
}

/**
 * Una fila elegible de un desplegable con buscador.
 *
 * Exportada porque la usa también el buscador de conceptos: la misma fila, con
 * el mismo realce y la misma palomita, para que elegir un concepto se vea igual
 * en los dos sitios. Dos copias se separan.
 */
export function Option({
  isSelected,
  onClick,
  children,
}: {
  isSelected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={isSelected}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors',
        'movil:min-h-[42px]',
        isSelected ? cn('bg-muted font-medium', HIGHLIGHT) : HIGHLIGHT,
      )}
    >
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {isSelected && <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />}
    </button>
  );
}

/** Sin tildes ni mayúsculas: "Educación" se encuentra escribiendo "educacion". */
function normal(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function ComboOptions({
  filtered,
  value,
  emptyLabel,
  canCreate,
  onSelect,
}: Pick<ComboSearch, 'filtered' | 'canCreate'> & {
  value: string;
  emptyLabel: string;
  onSelect: (value: string) => void;
}) {
  return (
    <ul className="max-h-64 overflow-y-auto p-1">
      <li>
        <Option isSelected={value === ''} onClick={() => onSelect('')}>
          <span className="text-muted-foreground">{emptyLabel}</span>
        </Option>
      </li>

      {filtered.map((o) => (
        <li key={o.value}>
          <Option isSelected={o.value === value} onClick={() => onSelect(o.value)}>
            {o.label}
          </Option>
        </li>
      ))}

      {filtered.length === 0 && !canCreate && (
        <li className="px-2.5 py-2 text-sm text-muted-foreground">
          {t('ui.combo.nothingMatches')}
        </li>
      )}
    </ul>
  );
}

function ComboTriggerContent({
  selected,
  emptyLabel,
  isInField,
  isOpen,
}: {
  selected: ComboOption | undefined;
  emptyLabel: string;
  isInField: boolean;
  isOpen: boolean;
}) {
  return (
    <>
      {/*
        El relleno de arriba va en el TEXTO y no en el botón: con el botón
        relleno, la flecha quedaría ocho píxeles baja porque `items-center` la
        centraría en la caja de contenido en vez de en el campo.
      */}
      <span
        data-lleno={selected ? 'si' : 'no'}
        data-vacio={selected ? undefined : ''}
        className={cn(
          'min-w-0 flex-1 truncate text-left',
          !selected && 'text-muted-foreground',
          isInField && 'pt-4',
        )}
      >
        {selected?.label ?? emptyLabel}
      </span>
      <ChevronDown
        className={cn('size-4 shrink-0 opacity-60 transition-transform', isOpen && 'rotate-180')}
        aria-hidden="true"
      />
    </>
  );
}
function DisabledCombo({ id, children }: { id: string | undefined; children: ReactNode }) {
  return (
    <span
      id={id}
      aria-disabled="true"
      className={cn(fieldTrigger(), 'cursor-not-allowed opacity-50')}
    >
      {children}
    </span>
  );
}
