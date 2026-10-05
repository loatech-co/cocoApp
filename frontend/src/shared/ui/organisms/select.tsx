import { Check, ChevronDown } from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';

import { cn } from '@/shared/lib/utils';
import { disparadorDeCampo, useDentroDeUnCampo } from '@/shared/ui/foundations/field';
import { REALCE } from '@/shared/ui/foundations/superficie';
import { Menu } from '@/shared/ui/molecules/menu';

interface OpcionDeSelect {
  valor: string;
  etiqueta: string;
}

interface SelectProps {
  /** El valor elegido. `''` es "ninguno". */
  valor: string;
  onCambiar: (valor: string) => void;
  opciones: OpcionDeSelect[];
  /** Nombre accesible del campo. */
  etiqueta: string;
  /** Texto de la opción sin valor. Si se omite, elegir es obligatorio. */
  vacio?: string;
  /** Los mismos dos de toda la app: `sm` mide 36 y `md` mide 44. */
  tamano?: 'sm' | 'md';
  deshabilitado?: boolean | undefined;
  /** A la izquierda, informativo: de qué es este campo. */
  icono?: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  /** A la derecha, activas. Una o dos, antes de la flecha. */
  acciones?: ReactNode[];
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
    valor,
    onCambiar,
    opciones,
    etiqueta,
    vacio,
    tamano = 'md',
    deshabilitado = false,
    id,
    className,
  } = props;
  const pequeno = tamano === 'sm';
  const sinNada = deshabilitado || (opciones.length === 0 && vacio === undefined);
  const enCampo = useDentroDeUnCampo();
  const dentro = <SelectTriggerContent select={props} enCampo={enCampo} />;

  // Deshabilitado no puede ser un botón que abre nada: se pinta igual pero
  // sin desplegable detrás, para que el foco no caiga en una trampa.
  if (sinNada) return <DisabledTrigger select={props}>{dentro}</DisabledTrigger>;

  return (
    <Menu
      etiqueta={etiqueta}
      tipo="lista"
      alineado="izquierda"
      // Los selectores viven en formularios, y un formulario largo se
      // desplaza: sin esto, el panel lo recorta la caja que lo contiene.
      flotante
      ancho="w-[max(12rem,100%)]"
      idDisparador={id}
      claseCaja={cn('w-full min-w-0', className)}
      claseDisparador={disparadorDeCampo(pequeno)}
      disparador={() => dentro}
    >
      {(cerrar) => (
        <SelectOptions
          valor={valor}
          opciones={opciones}
          vacio={vacio}
          onCambiar={onCambiar}
          cerrar={cerrar}
        />
      )}
    </Menu>
  );
}

function Opcion({
  elegida,
  onClick,
  children,
}: {
  elegida: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <li>
      <button
        type="button"
        role="option"
        aria-selected={elegida}
        onClick={onClick}
        className={cn(
          'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors',
          'movil:min-h-[42px]',
          // Quieta en `muted`, señalada en `accent`: con el mismo color para
          // las dos, pasar por encima de la opción ya elegida no cambia nada.
          elegida ? cn('bg-muted font-medium', REALCE) : REALCE,
        )}
      >
        <span className="min-w-0 flex-1 truncate">{children}</span>
        {elegida && <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />}
      </button>
    </li>
  );
}

function SelectOptions({
  valor,
  opciones,
  vacio,
  onCambiar,
  cerrar,
}: Pick<SelectProps, 'valor' | 'opciones' | 'onCambiar'> & {
  vacio: string | undefined;
  cerrar: () => void;
}) {
  const vacioEsPosible = vacio !== undefined;
  return (
    <ul className="max-h-64 overflow-y-auto">
      {vacioEsPosible && (
        <Opcion
          elegida={valor === ''}
          onClick={() => {
            onCambiar('');
            cerrar();
          }}
        >
          <span className="text-muted-foreground">{vacio}</span>
        </Opcion>
      )}

      {opciones.map((o) => (
        <Opcion
          key={o.valor}
          elegida={o.valor === valor}
          onClick={() => {
            onCambiar(o.valor);
            cerrar();
          }}
        >
          {o.etiqueta}
        </Opcion>
      ))}
    </ul>
  );
}

/** Lo que se ve dentro del campo: el icono, lo elegido, las acciones y la flecha. */
function SelectTriggerContent({ select, enCampo }: { select: SelectProps; enCampo: boolean }) {
  const { icono: Icono, vacio } = select;
  const pequeno = select.tamano === 'sm';
  const elegida = select.opciones.find((o) => o.valor === select.valor);
  const derecha = select.acciones?.filter(Boolean) ?? [];
  return (
    <>
      {Icono && (
        <span data-icono="" className="shrink-0 text-muted-foreground">
          <Icono className={pequeno ? 'size-3.5' : 'size-4'} aria-hidden={true} />
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
        data-lleno={elegida ? 'si' : 'no'}
        data-vacio={elegida ? undefined : ''}
        className={cn(
          'min-w-0 flex-1 truncate text-left',
          !elegida && 'text-muted-foreground',
          enCampo && 'pt-4',
        )}
      >
        {elegida?.etiqueta ?? vacio ?? '—'}
      </span>

      {derecha.map((accion, i) => (
        // El índice como clave: son uno o dos botones fijos que el campo
        // declara al construirse, no una lista que se reordene.
        // eslint-disable-next-line @eslint-react/no-array-index-key -- lista fija y posicional, sin id propio
        <span key={i} className="shrink-0">
          {accion}
        </span>
      ))}

      <ChevronDown
        className={cn('shrink-0 opacity-60', pequeno ? 'size-3.5' : 'size-4')}
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
        disparadorDeCampo(select.tamano === 'sm'),
        'cursor-not-allowed opacity-50',
        select.className,
      )}
      aria-disabled="true"
    >
      {children}
    </span>
  );
}
