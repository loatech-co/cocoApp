import { Check, ChevronDown } from 'lucide-react';
import { type ComponentType, type ReactNode } from 'react';

import { panelStyle, useMenuState, type Anclaje } from '@/shared/lib/menu-anchor';
import { useEsMovil } from '@/shared/lib/movil';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/atoms/button';
import { PanelInferior } from '@/shared/ui/atoms/panel-inferior';
import { REALCE, SUPERFICIE_FLOTANTE, SURGE } from '@/shared/ui/foundations/superficie';

const ROL = { menu: 'menu', panel: 'dialog', lista: 'listbox' } as const;
const ARIA = { menu: 'menu', panel: 'dialog', lista: 'listbox' } as const;

interface MenuProps {
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
  /** Cuánto mide el panel cuando no copia el de su disparador. Ver `ANCHOS`. */
  ancho?: keyof typeof ANCHOS;
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
  idDisparador?: string | undefined;
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
}

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
 *
 * ── Y en el teléfono no se despliega: SUBE ──────────────────────────────────
 * Por debajo del corte, un `menu` y un `panel` se abren como una hoja desde el
 * borde de abajo en vez de colgar del botón. Son tres cosas a la vez:
 *
 *   1. un desplegable colgado de un kebab que vive en la esquina de una fila
 *      se abre donde no hay sitio —contra el borde derecho, contra el pie de
 *      la pantalla— y acaba recortado o pegado al canto;
 *   2. las opciones caen lejos del pulgar, arriba de la pantalla, cuando el
 *      dedo está abajo;
 *   3. un calendario o un árbol de conceptos no caben en el ancho de un
 *      desplegable, así que había que angostarlos hasta que dejaran de
 *      poderse usar.
 *
 * La hoja resuelve las tres sin que la llamada tenga que saber nada: el mismo
 * `<Menu>` se dibuja de las dos formas.
 *
 * `lista` NO entra. Un campo que elige un valor —un desplegable de un
 * formulario— tiene que quedarse pegado a su campo: separarlo del sitio donde
 * se va a escribir el valor es perder de vista qué se está contestando.
 */
export function Menu(props: MenuProps) {
  const m = withDefaults(props);
  const { etiqueta, tipo, flotante, disparador, children } = m;
  /** Se abre como hoja desde abajo en vez de colgar del botón. */
  const enHoja = useEsMovil() && tipo !== 'lista';
  const { abierto, setAbierto, caja, anclaje, medir } = useMenuState(enHoja);
  const cerrar = (): void => setAbierto(false);
  const contenido = typeof children === 'function' ? children(cerrar) : children;

  function alternar(): void {
    if (flotante && !enHoja) medir();
    setAbierto((v) => !v);
  }

  return (
    <div ref={caja} className={cn('relative', m.claseCaja)}>
      {disparador ? (
        <button
          type="button"
          id={m.idDisparador}
          onClick={alternar}
          aria-expanded={abierto}
          aria-haspopup={ARIA[tipo]}
          className={m.claseDisparador ?? 'flex items-center rounded-full outline-none'}
        >
          {disparador({ abierto })}
        </button>
      ) : (
        <MenuButton m={m} abierto={abierto} onClick={alternar} />
      )}

      {/* La hoja se monta SIEMPRE, abierta o cerrada: lo que se desliza no se
          puede reconstruir en cada render, o aparece en vez de llegar. Y solo
          por debajo del corte, para que en el escritorio no cueste nada. */}
      {enHoja && (
        <PanelInferior
          abierto={abierto}
          titulo={etiqueta}
          // Por encima de una ficha: un calendario o un kebab se abren DESDE
          // dentro de un modal, y en la capa de fábrica se dibujarían detrás
          // del que los pidió.
          capa="z-[70]"
          onCerrar={cerrar}
        >
          {contenido}
        </PanelInferior>
      )}

      {abierto && !enHoja && (
        <MenuDropdown m={m} anclaje={anclaje}>
          {contenido}
        </MenuDropdown>
      )}
    </div>
  );
}

/**
 * Los anchos de un panel. Eran una clase libre en cada llamada, y así llegó a
 * haber un `w-[min(…)]` escrito a mano en una pantalla. Uno nuevo se añade aquí.
 *
 * | Ancho        | Para                                                     |
 * | ------------ | -------------------------------------------------------- |
 * | `sm`         | Una lista corta de acciones: ordenar, pagos pendientes   |
 * | `md`         | El menú de la cuenta en el riel                          |
 * | `base`       | El de fábrica                                            |
 * | `lg`         | Un árbol con casillas: el filtro de clasificación        |
 * | `campo`      | Un desplegable de formulario: su campo, y nunca menos de 12rem |
 * | `contenido`  | Lo que mida lo de dentro: el calendario de un día        |
 * | `calendario` | El de un rango: en el teléfono, el calendario y su relleno sin salirse; arriba del corte, su contenido |
 */
const ANCHOS = {
  sm: 'w-56',
  md: 'w-60',
  base: 'w-64',
  lg: 'w-72',
  campo: 'w-[max(12rem,100%)]',
  contenido: 'w-auto',
  calendario: 'w-[min(22rem,calc(100vw-2rem))] sm:w-auto',
} as const;

type Defaulted =
  | 'soloIcono'
  | 'activo'
  | 'alineado'
  | 'direccion'
  | 'ancho'
  | 'tipo'
  | 'flotante'
  | 'variante'
  | 'sinRelleno'
  | 'anchoPropio';

/** Las propiedades de un menú con sus valores de fábrica ya puestos. */
type MenuConfig = Omit<MenuProps, Defaulted> & Required<Pick<MenuProps, Defaulted>>;

// Con `??` y no con un `...` de valores de fábrica: una llamada que pasa un
// `undefined` explícito tiene que recibir el de fábrica, como con el valor
// por defecto de una desestructuración.
function withDefaults(p: MenuProps): MenuConfig {
  return {
    ...p,
    soloIcono: p.soloIcono ?? false,
    activo: p.activo ?? false,
    alineado: p.alineado ?? 'derecha',
    direccion: p.direccion ?? 'abajo',
    ancho: p.ancho ?? 'base',
    tipo: p.tipo ?? 'menu',
    flotante: p.flotante ?? false,
    variante: p.variante ?? 'herramienta',
    sinRelleno: p.sinRelleno ?? false,
    anchoPropio: p.anchoPropio ?? false,
  };
}

/** El botón de un menú sin disparador propio: icono, nombre y flecha. */
function MenuButton({
  m,
  abierto,
  onClick,
}: {
  m: MenuConfig;
  abierto: boolean;
  onClick: () => void;
}) {
  const { etiqueta, Icono, soloIcono, activo, variante } = m;
  return (
    <Button
      type="button"
      variant={variante}
      size={soloIcono ? 'sm-icon' : 'sm'}
      onClick={onClick}
      aria-expanded={abierto}
      aria-haspopup={ARIA[m.tipo]}
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
            // categoría— no puedan separarse.
            variante === 'ghost' && soloIcono && 'opacity-70',
          )}
          aria-hidden={true}
        />
      )}
      {!soloIcono && <span className="truncate">{etiqueta}</span>}
      {!soloIcono && (
        <ChevronDown
          className={cn(
            'size-3.5 shrink-0 opacity-60 transition-transform',
            abierto && 'rotate-180',
          )}
          aria-hidden={true}
        />
      )}
    </Button>
  );
}

/** El panel que cuelga del botón, en el escritorio. */
function MenuDropdown({
  m,
  anclaje,
  children,
}: {
  m: MenuConfig;
  anclaje: Anclaje | null;
  children: ReactNode;
}) {
  return (
    <div
      role={ROL[m.tipo]}
      aria-label={m.etiqueta}
      style={m.flotante && anclaje ? panelStyle(anclaje, m.anchoPropio, m.alineado) : undefined}
      className={panelClass(m)}
    >
      {children}
    </div>
  );
}

/** El panel que cuelga del botón: su superficie, su origen y su ancho. */
function panelClass({ flotante, anchoPropio, direccion, alineado, ancho, sinRelleno }: MenuConfig) {
  return cn(
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
    (!flotante || anchoPropio) && ANCHOS[ancho],
    'max-w-[calc(100vw-2rem)]',
    !flotante && (alineado === 'derecha' ? 'right-0' : 'left-0'),
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
            : // ── Elegida y señalada NO son el mismo color ─────────────────────
              // Lo elegido se queda en `muted`, que es la superficie quieta; lo
              // que está bajo el cursor pasa a `accent`, que es la del tema para
              // lo que responde. Con `muted` en los dos, pasar por encima de la
              // opción ya elegida no cambiaba nada y el menú parecía trabado.
              elegida
              ? cn('bg-muted font-medium text-foreground', REALCE)
              : cn('text-foreground', REALCE),
      )}
    >
      {Icono && <Icono className="size-4 shrink-0 opacity-70" aria-hidden={true} />}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {nota && <span className="shrink-0 text-xs text-muted-foreground">{nota}</span>}
      {elegida && <Check className="size-4 shrink-0 text-primary" aria-hidden={true} />}
    </button>
  );
}
