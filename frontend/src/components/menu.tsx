import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { SUPERFICIE_FLOTANTE, SURGE } from '@/components/ui/superficie';
import { cn } from '@/lib/utils';

const ROL = { menu: 'menu', panel: 'dialog', lista: 'listbox' } as const;
const ARIA = { menu: 'menu', panel: 'dialog', lista: 'listbox' } as const;

/**
 * Un desplegable.
 *
 * ── Por qué es un componente y no tres ──────────────────────────────────────
 * El filtro, el orden y el menú de la cuenta son la misma mecánica: un botón
 * que abre un panel, que se cierra al tocar fuera y con Escape. Escrita tres
 * veces, esa mecánica se arregla una vez y sigue rota en las otras dos — que
 * es exactamente como quedan los menús que se cierran solos en una pantalla y
 * en otra no.
 *
 * Lo que cambia entre ellos es el contenido, y eso es lo que se pasa.
 */
export function Menu({
  etiqueta,
  Icono,
  soloIcono = false,
  activo = false,
  alineado = 'derecha',
  direccion = 'abajo',
  ancho = 'w-64',
  tipo = 'menu',
  claseCaja,
  claseDisparador,
  flotante = false,
  variante = 'herramienta',
  sinRelleno = false,
  idDisparador,
  anchoPropio = false,
  disparador,
  children,
}: {
  /** Lo que dice el botón. Si `soloIcono`, pasa a ser su nombre accesible. */
  etiqueta: string;
  Icono?: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  soloIcono?: boolean;
  /** Pinta el botón encendido: hay algo elegido aquí dentro. */
  activo?: boolean;
  alineado?: 'izquierda' | 'derecha';
  /**
   * Hacia dónde se abre. `arriba` para los disparadores que viven al pie de
   * algo: abriendo hacia abajo, el panel se sale de la pantalla y la mitad de
   * las opciones quedan fuera.
   */
  direccion?: 'abajo' | 'arriba';
  ancho?: string;
  /**
   * `menu` es una lista de acciones; `panel` es un formulario dentro de un
   * desplegable; `lista` es un campo que elige un valor entre varios.
   * Anunciar como menú algo que lleva selectores hace que un lector de
   * pantalla prometa "elige una opción" y entregue otra cosa.
   */
  tipo?: 'menu' | 'panel' | 'lista';
  /** Clases de la caja que envuelve todo. Para estirarla a lo ancho. */
  claseCaja?: string;
  /** Clases del botón cuando se pasa un `disparador` propio. */
  claseDisparador?: string;
  /**
   * Coloca el panel contra la VENTANA en vez de contra su caja.
   *
   * Para los que viven dentro de algo que se desplaza —un formulario largo en
   * un modal, una tabla—: ahí cualquier ancestro con `overflow` recorta lo que
   * se salga de él, y un desplegable, por definición, se sale.
   */
  flotante?: boolean;
  /**
   * Cómo se ve el botón. `herramienta` es el recuadro de las barras de
   * filtros; `ghost` es solo el icono, para los que viven dentro de una
   * tarjeta y no tienen que competir con su contenido.
   */
  /**
   * `default` es el acento: para la acción principal de una barra. Las otras
   * dos son controles secundarios. El ALTO y el radio no se eligen aquí —los
   * pone `size="sm"` en el botón— para que un menú mida siempre lo mismo
   * que los filtros que tiene al lado.
   */
  variante?: 'herramienta' | 'ghost' | 'default';
  /**
   * Quita el acolchado del panel.
   *
   * El panel lleva 4px alrededor para que el resaltado de una opción sea una
   * pastilla por dentro y no una banda que choca contra la curva de la
   * esquina. Un panel con franjas A SANGRE —un buscador arriba con su línea,
   * un "crear" abajo con la suya— necesita lo contrario: con el acolchado,
   * esas líneas quedarían cortadas 4px antes de cada lado.
   */
  sinRelleno?: boolean;
  /**
   * El `id` del BOTÓN, no de la caja.
   *
   * Hace falta para que una etiqueta flotante pueda apuntarle con `htmlFor`.
   * Y tiene que ser el botón: `htmlFor` solo vale para los elementos que se
   * pueden etiquetar —`button`, `input`, `select`, `textarea`— y un `div` o un
   * `span` no está entre ellos, así que una etiqueta apuntando a la caja se
   * queda sin asociar y quien navega con lector de pantalla oye «botón» y
   * nada más.
   */
  idDisparador?: string;
  /**
   * Flotando, deja que el panel mida lo SUYO en vez de lo que mide el botón.
   *
   * Por defecto un panel flotante copia el ancho de su disparador, y eso es lo
   * correcto para un desplegable: un panel más ancho que su campo se lee como
   * otro elemento. Pero un calendario no cabe en un campo —necesita siete
   * columnas— y encogerlo al ancho del botón deja los días de tres píxeles.
   *
   * Con esto se aplica la clase `ancho`, y el panel se recorta al hueco que
   * quede hasta el borde de la ventana en vez de salirse.
   */
  anchoPropio?: boolean;
  /** Reemplaza el botón por completo (el avatar, por ejemplo). */
  disparador?: (props: { abierto: boolean }) => ReactNode;
  children: ReactNode | ((cerrar: () => void) => ReactNode);
}) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const [anclaje, setAnclaje] = useState<{ top: number; left: number; ancho: number } | null>(null);

  // Se mide al abrir: la posición de la caja en la ventana es lo único que
  // hace falta para colocar un panel que ya no depende de ella.
  function medir(): void {
    const r = caja.current?.getBoundingClientRect();
    if (r) setAnclaje({ top: r.bottom, left: r.left, ancho: r.width });
  }

  useEffect(() => {
    if (!abierto) return;

    const fuera = (e: MouseEvent): void => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    const escape = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setAbierto(false);
    };

    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('keydown', escape);
    };
  }, [abierto]);

  return (
    <div ref={caja} className={cn('relative', claseCaja)}>
      {disparador ? (
        <button
          type="button"
          id={idDisparador}
          onClick={() => {
            if (flotante) medir();
            setAbierto((v) => !v);
          }}
          aria-expanded={abierto}
          aria-haspopup={ARIA[tipo]}
          className={
            claseDisparador ??
            'flex items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'
          }
        >
          {disparador({ abierto })}
        </button>
      ) : (
        <Button
          type="button"
          variant={variante}
          size={soloIcono ? 'sm-icon' : 'sm'}
          onClick={() => {
            if (flotante) medir();
            setAbierto((v) => !v);
          }}
          aria-expanded={abierto}
          aria-haspopup={ARIA[tipo]}
          // Encendido cuando hay algo elegido aquí dentro, o mientras está
          // abierto: el propio estilo lo resuelve la variante.
          aria-pressed={activo || abierto}
          aria-label={soloIcono ? etiqueta : undefined}
          title={soloIcono ? etiqueta : undefined}
        >
          {Icono && (
            <Icono
              className={cn(
                'size-4 shrink-0',
                // El kebab, más tenue. Es un control SECUNDARIO: vive en la
                // esquina de cada fila y se repite tantas veces como filas
                // haya. A plena tinta, esa columna de puntos pesa más que los
                // nombres, que es lo que se viene a leer. Va aquí y no en cada
                // llamada para que los dos kebabs —el del centro y el del
                // grupo— no puedan separarse.
                variante === 'ghost' && soloIcono && 'opacity-70',
              )}
              aria-hidden={true}
            />
          )}
          {!soloIcono && <span className="truncate">{etiqueta}</span>}
          {!soloIcono && (
            <ChevronDown
              className={cn('size-3.5 shrink-0 opacity-60 transition-transform', abierto && 'rotate-180')}
              aria-hidden={true}
            />
          )}
        </Button>
      )}

      {abierto && (
        <div
          role={ROL[tipo]}
          aria-label={etiqueta}
          style={
            flotante && anclaje
              ? anchoPropio
                ? {
                    top: `${anclaje.top + 8}px`,
                    left: `${anclaje.left}px`,
                    // Se recorta a lo que queda hasta el borde de la ventana.
                    // Sin esto, un panel de 320px anclado a un campo que vive
                    // en la mitad derecha se sale de la pantalla, y lo que se
                    // sale no se puede pulsar.
                    maxWidth: `calc(100vw - ${anclaje.left}px - 1rem)`,
                  }
                : // El MISMO ancho que el campo, no un mínimo: un panel más
                  // ancho que su disparador se lee como otro elemento, y uno
                  // más angosto corta las opciones que el campo sí muestra
                  // enteras.
                  {
                    top: `${anclaje.top + 8}px`,
                    left: `${anclaje.left}px`,
                    width: `${anclaje.ancho}px`,
                  }
              : undefined
          }
          className={cn(
            'z-50 overflow-hidden rounded-lg',
            sinRelleno ? 'p-0' : 'p-1',
            SUPERFICIE_FLOTANTE,
            SURGE,
            // De dónde SALE. Un panel que crece desde su propio centro no viene
            // de ningún sitio; creciendo desde la esquina que toca el botón,
            // se lee como que lo despliega el botón.
            flotante
              ? 'origin-top'
              : direccion === 'arriba'
                ? alineado === 'derecha'
                  ? 'origin-bottom-right'
                  : 'origin-bottom-left'
                : alineado === 'derecha'
                  ? 'origin-top-right'
                  : 'origin-top-left',
            flotante ? 'fixed' : 'absolute',
            !flotante && (direccion === 'arriba' ? 'bottom-full mb-2' : 'top-full mt-2'),
            // Flotando, el ancho lo da el disparador —la clase mediría contra
            // la ventana, que no es la caja de nadie— salvo que se pida lo
            // contrario.
            (!flotante || anchoPropio) && ancho,
            'max-w-[calc(100vw-2rem)]',
            !flotante && (alineado === 'derecha' ? 'right-0' : 'left-0'),
          )}
        >
          {typeof children === 'function' ? children(() => setAbierto(false)) : children}
        </div>
      )}
    </div>
  );
}

/** El rótulo de un bloque del menú: "Ordenar por", "Filtrar por"… */
export function MenuTitulo({ children }: { children: ReactNode }) {
  return (
    <p className="px-2.5 pb-1 pt-1.5 text-xs font-semibold text-muted-foreground">{children}</p>
  );
}

/**
 * Una línea que cruza el panel ENTERO.
 *
 * El `-mx-1` anula el acolchado del panel: un separador que respeta el margen
 * de las opciones no separa dos bloques, parece una opción más que salió mal.
 */
export function MenuSeparador() {
  return <hr className="-mx-1 my-1 border-border" />;
}

/**
 * Una opción.
 *
 * La marca de elegida va a la DERECHA y el fondo cambia: la marca sola se
 * pierde al recorrer la lista con la vista, y el fondo solo no distingue lo
 * elegido de lo que está bajo el cursor.
 */
export function MenuOpcion({
  Icono,
  elegida = false,
  peligro = false,
  deshabilitada = false,
  nota,
  onClick,
  children,
}: {
  Icono?: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  elegida?: boolean;
  /** Rojo. Reservado a lo que no se puede deshacer, como cerrar la sesión. */
  peligro?: boolean;
  /**
   * Se ve pero no se puede elegir.
   *
   * Se enseña en vez de esconderse cuando la opción EXISTE y todavía no está:
   * quitarla haría pensar que la aplicación no sabe hacer eso; apagada dice
   * que sabrá. `nota` es el porqué, en dos palabras.
   */
  deshabilitada?: boolean;
  nota?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={deshabilitada}
      aria-disabled={deshabilitada}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors',
        // Una fila de menú son 36 de puntero. Con el dedo, 42.
        'movil:min-h-[42px]',
        deshabilitada
          ? 'cursor-not-allowed text-muted-foreground opacity-60'
          : peligro
          ? 'font-medium text-destructive hover:bg-destructive/10'
          // ── Elegida y señalada NO son el mismo color ─────────────────────
          // Lo elegido se queda en `muted`, que es la superficie quieta; lo
          // que está bajo el cursor pasa a `accent`, que es la del tema para
          // lo que responde. Con `muted` en los dos, pasar por encima de la
          // opción ya elegida no cambiaba nada y el menú parecía trabado.
          : elegida
            ? 'bg-muted font-medium text-foreground hover:bg-accent hover:text-accent-foreground'
            : 'text-foreground hover:bg-accent hover:text-accent-foreground',
      )}
    >
      {Icono && <Icono className="size-4 shrink-0 opacity-70" aria-hidden={true} />}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {nota && <span className="shrink-0 text-xs text-muted-foreground">{nota}</span>}
      {elegida && <Check className="size-4 shrink-0 text-primary" aria-hidden={true} />}
    </button>
  );
}
