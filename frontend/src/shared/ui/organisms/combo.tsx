import { Check, ChevronDown, CornerDownLeft, Plus } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { cn } from '@/shared/lib/utils';
import { SearchBox } from '@/shared/ui/atoms/search-box';
import { disparadorDeCampo, useDentroDeUnCampo } from '@/shared/ui/foundations/field';
import { REALCE } from '@/shared/ui/foundations/superficie';
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

interface OpcionDeCombo {
  valor: string;
  etiqueta: string;
}

interface ComboProps {
  /** Nombre accesible. No se pinta: la etiqueta visible va fuera. */
  etiqueta: string;
  /** El valor elegido. `''` es ninguno. */
  valor: string;
  opciones: OpcionDeCombo[];
  onCambiar: (valor: string) => void;
  /** Si se pasa, se ofrece crear lo que no exista. */
  onCrear?: (nombre: string) => void;
  vacio?: string;
  deshabilitado?: boolean;
  /** Mientras se crea, para no dejar pulsar dos veces. */
  creando?: boolean;
  id?: string;
}

export function Combo({
  etiqueta,
  valor,
  opciones,
  onCambiar,
  onCrear,
  vacio = 'Sin elegir',
  deshabilitado = false,
  creando = false,
  id,
}: ComboProps) {
  const busqueda = useComboSearch(opciones, onCambiar, onCrear);
  const campo = useRef<HTMLInputElement>(null);
  const enCampo = useDentroDeUnCampo();

  const elegida = opciones.find((o) => o.valor === valor);

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
  const dentro = (abierto: boolean) => (
    <ComboTriggerContent elegida={elegida} vacio={vacio} enCampo={enCampo} abierto={abierto} />
  );

  // Bloqueado no puede ser un botón que abre nada: se pinta igual pero sin
  // desplegable detrás, para que el foco no caiga en una trampa.
  if (deshabilitado) return <DisabledCombo id={id}>{dentro(false)}</DisabledCombo>;

  return (
    <Menu
      etiqueta={etiqueta}
      tipo="lista"
      alineado="izquierda"
      flotante
      // El panel dibuja sus propias franjas a sangre —el buscador arriba, el
      // "crear" abajo—: con el acolchado del menú, esas líneas quedarían
      // cortadas 4px antes de cada lado.
      sinRelleno
      claseCaja="w-full min-w-0"
      claseDisparador={disparadorDeCampo()}
      idDisparador={id}
      disparador={({ abierto }) => dentro(abierto)}
    >
      {(cerrar) => (
        <ComboPanel
          campo={campo}
          busqueda={busqueda}
          valor={valor}
          vacio={vacio}
          creando={creando}
          cerrar={cerrar}
        />
      )}
    </Menu>
  );
}

interface ComboSearch {
  busca: string;
  setBusca: (v: string) => void;
  filtradas: OpcionDeCombo[];
  puedeCrear: boolean;
  /** Elige una opción y vacía el buscador. */
  elegir: (valor: string) => void;
  /** Crea lo escrito y vacía el buscador. */
  crear: () => void;
}

/** Lo escrito en el buscador, lo que deja ver y lo que se puede crear con ello. */
function useComboSearch(
  opciones: OpcionDeCombo[],
  onCambiar: (valor: string) => void,
  onCrear: ((nombre: string) => void) | undefined,
): ComboSearch {
  const [busca, setBusca] = useState('');

  const filtradas = useMemo(() => {
    const q = normal(busca);
    if (q === '') return opciones;
    return opciones.filter((o) => normal(o.etiqueta).includes(q));
  }, [opciones, busca]);

  // Ofrecer crear solo cuando lo escrito no existe ya. Con un nombre que
  // coincide, "crear" produciría dos conceptos idénticos —y a partir de ahí
  // la misma plata sumando por separado en los dos—.
  const puedeCrear =
    onCrear !== undefined &&
    busca.trim() !== '' &&
    !opciones.some((o) => normal(o.etiqueta) === normal(busca));

  return {
    busca,
    setBusca,
    filtradas,
    puedeCrear,
    elegir: (v) => {
      onCambiar(v);
      setBusca('');
    },
    crear: () => {
      onCrear?.(busca.trim());
      setBusca('');
    },
  };
}

interface ComboPanelProps {
  campo: React.RefObject<HTMLInputElement | null>;
  busqueda: ComboSearch;
  valor: string;
  vacio: string;
  creando: boolean;
  cerrar: () => void;
}

function ComboPanel({ campo, busqueda, valor, vacio, creando, cerrar }: ComboPanelProps) {
  const { busca, setBusca, filtradas, puedeCrear } = busqueda;

  // El foco al abrir: si hay que pulsar el campo antes de escribir, el gesto
  // son dos clics y nadie llega a descubrir que se podía filtrar.
  useEffect(() => {
    const t = setTimeout(() => campo.current?.focus(), 10);
    return () => clearTimeout(t);
  }, [campo]);

  function onElegir(v: string): void {
    busqueda.elegir(v);
    cerrar();
  }

  function onCrear(): void {
    busqueda.crear();
    cerrar();
  }

  return (
    <div className="flex flex-col">
      <SearchBox
        forma="cabecera"
        ref={campo}
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        onKeyDown={(e) => {
          // Enter elige lo único que queda, que es lo que uno espera después
          // de escribir tres letras y ver una sola fila.
          if (e.key !== 'Enter') return;
          e.preventDefault();
          const [unica] = filtradas;
          if (filtradas.length === 1 && unica !== undefined) onElegir(unica.valor);
          else if (puedeCrear) onCrear();
        }}
        placeholder="Buscar…"
      />

      <ComboOptions
        filtradas={filtradas}
        valor={valor}
        vacio={vacio}
        puedeCrear={puedeCrear}
        onElegir={onElegir}
      />

      {puedeCrear && (
        <CreateOption creando={creando} onCrear={onCrear}>
          Crear “{busca.trim()}”
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
  creando,
  conIntro = false,
  onCrear,
  children,
}: {
  creando: boolean;
  conIntro?: boolean;
  onCrear: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onCrear}
      disabled={creando}
      className={cn(
        'flex w-full items-center gap-2 border-t border-border px-3 py-2.5 text-left text-sm',
        'font-medium transition-colors',
        REALCE,
        'disabled:opacity-60',
      )}
    >
      <Plus className="size-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 truncate">{children}</span>
      {conIntro && (
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
export function Opcion({
  elegida,
  onClick,
  children,
}: {
  elegida: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={elegida}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors',
        'movil:min-h-[42px]',
        elegida ? cn('bg-muted font-medium', REALCE) : REALCE,
      )}
    >
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {elegida && <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />}
    </button>
  );
}

/** Sin tildes ni mayúsculas: "Educación" se encuentra escribiendo "educacion". */
function normal(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function ComboOptions({
  filtradas,
  valor,
  vacio,
  puedeCrear,
  onElegir,
}: Pick<ComboSearch, 'filtradas' | 'puedeCrear'> & {
  valor: string;
  vacio: string;
  onElegir: (valor: string) => void;
}) {
  return (
    <ul className="max-h-64 overflow-y-auto p-1">
      <li>
        <Opcion elegida={valor === ''} onClick={() => onElegir('')}>
          <span className="text-muted-foreground">{vacio}</span>
        </Opcion>
      </li>

      {filtradas.map((o) => (
        <li key={o.valor}>
          <Opcion elegida={o.valor === valor} onClick={() => onElegir(o.valor)}>
            {o.etiqueta}
          </Opcion>
        </li>
      ))}

      {filtradas.length === 0 && !puedeCrear && (
        <li className="px-2.5 py-2 text-sm text-muted-foreground">Nada coincide.</li>
      )}
    </ul>
  );
}

function ComboTriggerContent({
  elegida,
  vacio,
  enCampo,
  abierto,
}: {
  elegida: OpcionDeCombo | undefined;
  vacio: string;
  enCampo: boolean;
  abierto: boolean;
}) {
  return (
    <>
      {/*
        El relleno de arriba va en el TEXTO y no en el botón: con el botón
        relleno, la flecha quedaría ocho píxeles baja porque `items-center` la
        centraría en la caja de contenido en vez de en el campo.
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
        {elegida?.etiqueta ?? vacio}
      </span>
      <ChevronDown
        className={cn('size-4 shrink-0 opacity-60 transition-transform', abierto && 'rotate-180')}
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
      className={cn(disparadorDeCampo(), 'cursor-not-allowed opacity-50')}
    >
      {children}
    </span>
  );
}
