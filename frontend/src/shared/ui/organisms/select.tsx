import { Check, ChevronDown } from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';

import { cn } from '@/shared/lib/utils';
import { fieldTrigger, useInsideField } from '@/shared/ui/foundations/field';
import { HIGHLIGHT } from '@/shared/ui/foundations/surface';
import { Menu } from '@/shared/ui/molecules/menu';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  /** El valor elegido. `''` es "ninguno". */
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  /** Nombre accesible del campo. */
  label: string;
  /** Texto de la opción sin valor. Si se omite, elegir es obligatorio. */
  emptyLabel?: string;
  /** Los mismos dos de toda la app: `sm` mide 36 y `md` mide 44. */
  size?: 'sm' | 'md';
  disabled?: boolean | undefined;
  /** A la izquierda, informativo: de qué es este campo. */
  icon?: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  /** A la derecha, activas. Una o dos, antes de la flecha. */
  actions?: ReactNode[];
  /** El `id` del BOTÓN, para que una etiqueta pueda apuntarle. */
  id?: string;
  className?: string;
}

/**
 * Una lista desplegable, dibujada por la app.
 *
 * ── Por qué no es un `<select>` ─────────────────────────────────────────────
 * Porque su lista la pinta el SISTEMA OPERATIVO: su tipografía, sus colores,
 * su idioma y su flecha pegada al borde derecho. La misma pantalla se ve
 * distinta en cada máquina, y en medio de un formulario verde aparece un
 * cuadro gris de Windows.
 *
 * Está construida sobre `Menu`, que es quien sabe abrirse, cerrarse al tocar
 * fuera y cerrarse con Escape. Si esa mecánica se arregla, se arregla aquí y
 * en el filtro y en el menú de la cuenta a la vez.
 *
 * ── Qué se pierde y por qué se acepta ───────────────────────────────────────
 * El nativo en un teléfono abre la rueda de iOS o el diálogo de Android, que
 * están bien hechos. Se renuncia a eso a cambio de que la app se vea igual en
 * todas partes; a cambio, esta lista se desplaza, marca lo elegido y cierra al
 * elegir, que es lo que se usa el 99 % de las veces.
 *
 * ── Los iconos, los mismos que en un campo de texto ─────────────────────────
 * `icono` a la izquierda es informativo; `acciones` a la derecha son activas y
 * van ANTES de la flecha, que es la acción propia del desplegable y siempre la
 * última. Aquí no hace falta reservarles sitio con relleno como en un
 * `<input>`: un botón sí puede tener hijos, así que van en la misma fila y el
 * texto se encoge solo.
 *
 * ── Qué es `data-lleno` y qué es `data-vacio` ───────────────────────────────
 * Los dos los lee la etiqueta flotante de `.campo`, en `index.css`: el primero
 * para subirse cuando hay algo elegido, el segundo para esconder el texto de
 * «sin elegir» mientras la etiqueta está ocupando su sitio.
 */
export function Select(props: SelectProps) {
  const {
    value,
    onChange,
    options,
    label,
    emptyLabel,
    size = 'md',
    disabled: isDisabled = false,
    id,
    className,
  } = props;
  const isSmall = size === 'sm';
  const isInert = isDisabled || (options.length === 0 && emptyLabel === undefined);
  const isInField = useInsideField();
  const triggerContent = <SelectTriggerContent select={props} isInField={isInField} />;

  // Deshabilitado no puede ser un botón que abre nada: se pinta igual pero
  // sin desplegable detrás, para que el foco no caiga en una trampa.
  if (isInert) return <DisabledTrigger select={props}>{triggerContent}</DisabledTrigger>;

  return (
    <Menu
      label={label}
      kind="list"
      align="left"
      // Los selectores viven en formularios, y un formulario largo se
      // desplaza: sin esto, el panel lo recorta la caja que lo contiene.
      isFloating
      width="field"
      triggerId={id}
      boxClassName={cn('w-full min-w-0', className)}
      triggerClassName={fieldTrigger(isSmall)}
      trigger={() => triggerContent}
    >
      {(close) => (
        <SelectOptions
          value={value}
          options={options}
          emptyLabel={emptyLabel}
          onChange={onChange}
          close={close}
        />
      )}
    </Menu>
  );
}

function Option({
  isSelected,
  onClick,
  children,
}: {
  isSelected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <li>
      <button
        type="button"
        role="option"
        aria-selected={isSelected}
        onClick={onClick}
        className={cn(
          'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors',
          'movil:min-h-[42px]',
          // Quieta en `muted`, señalada en `accent`: con el mismo color para
          // las dos, pasar por encima de la opción ya elegida no cambia nada.
          isSelected ? cn('bg-muted font-medium', HIGHLIGHT) : HIGHLIGHT,
        )}
      >
        <span className="min-w-0 flex-1 truncate">{children}</span>
        {isSelected && <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />}
      </button>
    </li>
  );
}

function SelectOptions({
  value,
  options,
  emptyLabel,
  onChange,
  close,
}: Pick<SelectProps, 'value' | 'options' | 'onChange'> & {
  emptyLabel: string | undefined;
  close: () => void;
}) {
  const canBeEmpty = emptyLabel !== undefined;
  return (
    <ul className="max-h-64 overflow-y-auto">
      {canBeEmpty && (
        <Option
          isSelected={value === ''}
          onClick={() => {
            onChange('');
            close();
          }}
        >
          <span className="text-muted-foreground">{emptyLabel}</span>
        </Option>
      )}

      {options.map((o) => (
        <Option
          key={o.value}
          isSelected={o.value === value}
          onClick={() => {
            onChange(o.value);
            close();
          }}
        >
          {o.label}
        </Option>
      ))}
    </ul>
  );
}

/** Lo que se ve dentro del campo: el icono, lo elegido, las acciones y la flecha. */
function SelectTriggerContent({ select, isInField }: { select: SelectProps; isInField: boolean }) {
  const { icon: Icon, emptyLabel } = select;
  const isSmall = select.size === 'sm';
  const selected = select.options.find((o) => o.value === select.value);
  const trailing = select.actions?.filter(Boolean) ?? [];
  return (
    <>
      {Icon && (
        <span data-icono="" className="shrink-0 text-muted-foreground">
          <Icon className={isSmall ? 'size-3.5' : 'size-4'} aria-hidden={true} />
        </span>
      )}

      {/*
        El relleno de arriba va en el TEXTO y no en el botón, y por eso la
        flecha no se mueve: con el botón relleno, `items-center` centraría la
        flecha en la caja de contenido en vez de en el campo y quedaría ocho
        píxeles baja. Estirando solo el texto, la línea crece hacia arriba y la
        flecha se queda en el centro del campo, que es donde se busca.
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
        {selected?.label ?? emptyLabel ?? '—'}
      </span>

      {trailing.map((action, i) => (
        // El índice como clave: son uno o dos botones fijos que el campo
        // declara al construirse, no una lista que se reordene.
        // eslint-disable-next-line @eslint-react/no-array-index-key -- lista fija y posicional, sin id propio
        <span key={i} className="shrink-0">
          {action}
        </span>
      ))}

      <ChevronDown
        className={cn('shrink-0 opacity-60', isSmall ? 'size-3.5' : 'size-4')}
        aria-hidden="true"
      />
    </>
  );
}
function DisabledTrigger({ select, children }: { select: SelectProps; children: ReactNode }) {
  return (
    <span
      id={select.id}
      className={cn(
        fieldTrigger(select.size === 'sm'),
        'cursor-not-allowed opacity-50',
        select.className,
      )}
      aria-disabled="true"
    >
      {children}
    </span>
  );
}
