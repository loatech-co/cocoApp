import { Check, ChevronDown, Plus, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Menu } from '@/components/menu';
import { cn } from '@/lib/utils';
import { useDentroDeUnCampo } from '@/components/ui/campo';

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

export interface OpcionDeCombo {
  valor: string;
  etiqueta: string;
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
}: {
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
}) {
  const [busca, setBusca] = useState('');
  const campo = useRef<HTMLInputElement>(null);
  const enCampo = useDentroDeUnCampo();

  const elegida = opciones.find((o) => o.valor === valor);

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

  if (deshabilitado) {
    return (
      <span
        id={id}
        aria-disabled="true"
        className={cn(
          'flex h-11 w-full min-w-0 cursor-not-allowed items-center gap-2 rounded-lg',
          'border border-input bg-card px-3 text-sm opacity-50',
        )}
      >
        <span
          data-vacio=""
          className={cn(
            'min-w-0 flex-1 truncate text-left text-muted-foreground',
            enCampo && 'pt-4',
          )}
        >
          {vacio}
        </span>
        <ChevronDown className="size-4 shrink-0 opacity-60" aria-hidden="true" />
      </span>
    );
  }

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
      claseDisparador={cn(
        // Borde de CAMPO, igual que el `Select` y el `Input` de la misma fila.
        'flex h-11 w-full min-w-0 items-center gap-2 rounded-lg border border-input bg-card px-3 text-sm',
        'hover:border-ring/40',
        'outline-none transition-colors focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring',
      )}
      idDisparador={id}
      disparador={({ abierto }) => (
        <>
          {/*
            El relleno de arriba va en el TEXTO y no en el botón: con el botón
            relleno, la flecha quedaría ocho píxeles baja porque
            `items-center` la centraría en la caja de contenido en vez de en
            el campo.
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
      )}
    >
      {(cerrar) => (
        <ComboPanel
          campo={campo}
          busca={busca}
          setBusca={setBusca}
          filtradas={filtradas}
          valor={valor}
          vacio={vacio}
          puedeCrear={puedeCrear}
          creando={creando}
          onElegir={(v) => {
            onCambiar(v);
            setBusca('');
            cerrar();
          }}
          onCrear={() => {
            onCrear?.(busca.trim());
            setBusca('');
            cerrar();
          }}
        />
      )}
    </Menu>
  );
}

function ComboPanel({
  campo,
  busca,
  setBusca,
  filtradas,
  valor,
  vacio,
  puedeCrear,
  creando,
  onElegir,
  onCrear,
}: {
  campo: React.RefObject<HTMLInputElement | null>;
  busca: string;
  setBusca: (v: string) => void;
  filtradas: OpcionDeCombo[];
  valor: string;
  vacio: string;
  puedeCrear: boolean;
  creando: boolean;
  onElegir: (valor: string) => void;
  onCrear: () => void;
}) {
  // El foco al abrir: si hay que pulsar el campo antes de escribir, el gesto
  // son dos clics y nadie llega a descubrir que se podía filtrar.
  useEffect(() => {
    const t = setTimeout(() => campo.current?.focus(), 10);
    return () => clearTimeout(t);
  }, [campo]);

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <input
          ref={campo}
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          onKeyDown={(e) => {
            // Enter elige lo único que queda, que es lo que uno espera después
            // de escribir tres letras y ver una sola fila.
            if (e.key !== 'Enter') return;
            e.preventDefault();
            if (filtradas.length === 1) onElegir(filtradas[0].valor);
            else if (puedeCrear) onCrear();
          }}
          placeholder="Buscar…"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>

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

      {puedeCrear && (
        <button
          type="button"
          onClick={onCrear}
          disabled={creando}
          className={cn(
            'flex w-full items-center gap-2 border-t border-border px-3 py-2.5 text-left text-sm',
            'font-medium transition-colors hover:bg-accent hover:text-accent-foreground',
            'disabled:opacity-60',
          )}
        >
          <Plus className="size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 truncate">Crear “{busca.trim()}”</span>
        </button>
      )}
    </div>
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
    <button
      type="button"
      role="option"
      aria-selected={elegida}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors',
        'movil:min-h-[42px]',
        elegida
          ? 'bg-muted font-medium hover:bg-accent hover:text-accent-foreground'
          : 'hover:bg-accent hover:text-accent-foreground',
      )}
    >
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {elegida && <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />}
    </button>
  );
}

/** Sin tildes ni mayúsculas: "Educación" se encuentra escribiendo "educacion". */
function normal(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}
