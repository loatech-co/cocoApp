import { Check, ChevronDown } from 'lucide-react';
import { type ComponentType, type ReactNode } from 'react';

import { panelStyle, useMenuState, type Anclaje } from '@/shared/lib/menu-anchor';
import { useEsMovil } from '@/shared/lib/movil';
import { cn } from '@/shared/lib/utils';
import { BottomSheet } from '@/shared/ui/atoms/bottom-sheet';
import { Button } from '@/shared/ui/atoms/button';
import { HIGHLIGHT, FLOATING_SURFACE, SURGE } from '@/shared/ui/foundations/surface';

const ROLE = { menu: 'menu', panel: 'dialog', list: 'listbox', search: 'dialog' } as const;
const ARIA = { menu: 'menu', panel: 'dialog', list: 'listbox', search: 'dialog' } as const;

interface MenuProps {
  /** Lo que dice el botón. Si `soloIcono`, pasa a ser su nombre accesible. */
  label: string;
  Icon?: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  isIconOnly?: boolean;
  /** Pinta el botón encendido: hay algo elegido aquí dentro. */
  isActive?: boolean;
  align?: 'left' | 'right';
  /**
   * Hacia dónde se abre. `arriba` para los disparadores que viven al pie de
   * algo: abriendo hacia abajo, el panel se sale de la pantalla y la mitad de
   * las opciones quedan fuera.
   */
  direction?: 'down' | 'up';
  /** Cuánto mide el panel cuando no copia el de su disparador. Ver `ANCHOS`. */
  width?: keyof typeof WIDTHS;
  /**
   * `menu` es una lista de acciones; `panel` es un formulario dentro de un
   * desplegable; `lista` es un campo que elige un valor entre varios.
   * Anunciar como menú algo que lleva selectores hace que un lector de
   * pantalla prometa "elige una opción" y entregue otra cosa.
   *
   * `buscador` es una `lista` con su caja de búsqueda: se queda pegado a su
   * campo como ella, pero el panel es un diálogo y no una lista, porque una
   * lista solo puede contener opciones y aquí dentro hay una caja de texto,
   * botones y la lista de verdad. La lista la pone quien llena el panel.
   */
  kind?: 'menu' | 'panel' | 'list' | 'search';
  /** Clases de la caja que envuelve todo. Para estirarla a lo ancho. */
  boxClassName?: string;
  /** Clases del botón cuando se pasa un `disparador` propio. */
  triggerClassName?: string;
  /**
   * Coloca el panel contra la VENTANA en vez de contra su caja.
   *
   * Para los que viven dentro de algo que se desplaza —un formulario largo en
   * un modal, una tabla—: ahí cualquier ancestro con `overflow` recorta lo que
   * se salga de él, y un desplegable, por definición, se sale.
   */
  isFloating?: boolean;
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
  variant?: 'tool' | 'ghost' | 'default';
  /**
   * Quita el acolchado del panel.
   *
   * El panel lleva 4px alrededor para que el resaltado de una opción sea una
   * pastilla por dentro y no una banda que choca contra la curva de la
   * esquina. Un panel con franjas A SANGRE —un buscador arriba con su línea,
   * un "crear" abajo con la suya— necesita lo contrario: con el acolchado,
   * esas líneas quedarían cortadas 4px antes de cada lado.
   */
  isUnpadded?: boolean;
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
  triggerId?: string | undefined;
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
  hasOwnWidth?: boolean;
  /** Reemplaza el botón por completo (el avatar, por ejemplo). */
  trigger?: (props: { isOpen: boolean }) => ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
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
 * `lista` y `buscador` NO entran. Un campo que elige un valor —un desplegable de un
 * formulario— tiene que quedarse pegado a su campo: separarlo del sitio donde
 * se va a escribir el valor es perder de vista qué se está contestando.
 */
export function Menu(props: MenuProps) {
  const m = withDefaults(props);
  const { label, kind, isFloating, trigger, children } = m;
  /** Se abre como hoja desde abajo en vez de colgar del botón. */
  const isSheet = useEsMovil() && kind !== 'list' && kind !== 'search';
  const { abierto: isOpen, setAbierto: setIsOpen, caja, anclaje, medir } = useMenuState(isSheet);
  const close = (): void => setIsOpen(false);
  const content = typeof children === 'function' ? children(close) : children;

  function toggle(): void {
    if (isFloating && !isSheet) medir();
    setIsOpen((wasOpen) => !wasOpen);
  }

  return (
    <div ref={caja} className={cn('relative', m.boxClassName)}>
      {trigger ? (
        <button
          type="button"
          id={m.triggerId}
          onClick={toggle}
          aria-expanded={isOpen}
          aria-haspopup={ARIA[kind]}
          className={m.triggerClassName ?? 'flex items-center rounded-full outline-none'}
        >
          {trigger({ isOpen })}
        </button>
      ) : (
        <MenuButton m={m} isOpen={isOpen} onClick={toggle} />
      )}

      {/* La hoja se monta SIEMPRE, abierta o cerrada: lo que se desliza no se
          puede reconstruir en cada render, o aparece en vez de llegar. Y solo
          por debajo del corte, para que en el escritorio no cueste nada. */}
      {isSheet && (
        <BottomSheet
          isOpen={isOpen}
          title={label}
          // Por encima de una ficha: un calendario o un kebab se abren DESDE
          // dentro de un modal, y en la capa de fábrica se dibujarían detrás
          // del que los pidió.
          layer="z-[70]"
          onClose={close}
        >
          {content}
        </BottomSheet>
      )}

      {isOpen && !isSheet && (
        <MenuDropdown m={m} anchor={anclaje}>
          {content}
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
const WIDTHS = {
  sm: 'w-56',
  md: 'w-60',
  base: 'w-64',
  lg: 'w-72',
  field: 'w-[max(12rem,100%)]',
  content: 'w-auto',
  calendar: 'w-[min(22rem,calc(100vw-2rem))] sm:w-auto',
} as const;

type Defaulted =
  | 'isIconOnly'
  | 'isActive'
  | 'align'
  | 'direction'
  | 'width'
  | 'kind'
  | 'isFloating'
  | 'variant'
  | 'isUnpadded'
  | 'hasOwnWidth';

/** Las propiedades de un menú con sus valores de fábrica ya puestos. */
type MenuConfig = Omit<MenuProps, Defaulted> & Required<Pick<MenuProps, Defaulted>>;

// Con `??` y no con un `...` de valores de fábrica: una llamada que pasa un
// `undefined` explícito tiene que recibir el de fábrica, como con el valor
// por defecto de una desestructuración.
function withDefaults(p: MenuProps): MenuConfig {
  return {
    ...p,
    isIconOnly: p.isIconOnly ?? false,
    isActive: p.isActive ?? false,
    align: p.align ?? 'right',
    direction: p.direction ?? 'down',
    width: p.width ?? 'base',
    kind: p.kind ?? 'menu',
    isFloating: p.isFloating ?? false,
    variant: p.variant ?? 'tool',
    isUnpadded: p.isUnpadded ?? false,
    hasOwnWidth: p.hasOwnWidth ?? false,
  };
}

/** El botón de un menú sin disparador propio: icono, nombre y flecha. */
function MenuButton({
  m,
  isOpen,
  onClick,
}: {
  m: MenuConfig;
  isOpen: boolean;
  onClick: () => void;
}) {
  const { label, Icon, isIconOnly, isActive, variant } = m;
  return (
    <Button
      type="button"
      variant={variant}
      size={isIconOnly ? 'sm-icon' : 'sm'}
      onClick={onClick}
      aria-expanded={isOpen}
      aria-haspopup={ARIA[m.kind]}
      // Encendido cuando hay algo elegido aquí dentro, o mientras está
      // abierto: el propio estilo lo resuelve la variante.
      aria-pressed={isActive || isOpen}
      aria-label={isIconOnly ? label : undefined}
      title={isIconOnly ? label : undefined}
    >
      {Icon && (
        <Icon
          className={cn(
            'size-4 shrink-0',
            // El kebab, más tenue. Es un control SECUNDARIO: vive en la
            // esquina de cada fila y se repite tantas veces como filas
            // haya. A plena tinta, esa columna de puntos pesa más que los
            // nombres, que es lo que se viene a leer. Va aquí y no en cada
            // llamada para que los dos kebabs —el del centro y el del
            // categoría— no puedan separarse.
            variant === 'ghost' && isIconOnly && 'opacity-70',
          )}
          aria-hidden={true}
        />
      )}
      {!isIconOnly && <span className="truncate">{label}</span>}
      {!isIconOnly && (
        <ChevronDown
          className={cn(
            'size-3.5 shrink-0 opacity-60 transition-transform',
            isOpen && 'rotate-180',
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
  anchor,
  children,
}: {
  m: MenuConfig;
  anchor: Anclaje | null;
  children: ReactNode;
}) {
  return (
    <div
      role={ROLE[m.kind]}
      aria-label={m.label}
      style={m.isFloating && anchor ? panelStyle(anchor, m.hasOwnWidth, m.align) : undefined}
      className={panelClass(m)}
    >
      {children}
    </div>
  );
}

/** El panel que cuelga del botón: su superficie, su origen y su ancho. */
function panelClass({ isFloating, hasOwnWidth, direction, align, width, isUnpadded }: MenuConfig) {
  return cn(
    'z-50 rounded-lg',
    // Flotando lleva tope de alto (`panelStyle`), así que lo que no quepa se
    // desplaza dentro del panel en vez de recortarse.
    isFloating ? 'overflow-y-auto overscroll-contain' : 'overflow-hidden',
    isUnpadded ? 'p-0' : 'p-1',
    FLOATING_SURFACE,
    SURGE,
    // De dónde SALE. Un panel que crece desde su propio centro no viene
    // de ningún sitio; creciendo desde la esquina que toca el botón,
    // se lee como que lo despliega el botón.
    isFloating
      ? 'origin-top'
      : direction === 'up'
        ? align === 'right'
          ? 'origin-bottom-right'
          : 'origin-bottom-left'
        : align === 'right'
          ? 'origin-top-right'
          : 'origin-top-left',
    isFloating ? 'fixed' : 'absolute',
    !isFloating && (direction === 'up' ? 'bottom-full mb-2' : 'top-full mt-2'),
    // Flotando, el ancho lo da el disparador —la clase mediría contra
    // la ventana, que no es la caja de nadie— salvo que se pida lo
    // contrario.
    (!isFloating || hasOwnWidth) && WIDTHS[width],
    'max-w-[calc(100vw-2rem)]',
    !isFloating && (align === 'right' ? 'right-0' : 'left-0'),
  );
}
/** El rótulo de un bloque del menú: "Ordenar por", "Filtrar por"… */
export function MenuTitle({ children }: { children: ReactNode }) {
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
export function MenuSeparator() {
  return <hr className="-mx-1 my-1 border-border" />;
}

/**
 * Una opción.
 *
 * La marca de elegida va a la DERECHA y el fondo cambia: la marca sola se
 * pierde al recorrer la lista con la vista, y el fondo solo no distingue lo
 * elegido de lo que está bajo el cursor.
 */
export function MenuOption({
  Icon,
  isSelected = false,
  isDestructive = false,
  disabled: isDisabled = false,
  note,
  onClick,
  children,
}: {
  Icon?: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  isSelected?: boolean;
  /** Rojo. Reservado a lo que no se puede deshacer, como cerrar la sesión. */
  isDestructive?: boolean;
  /**
   * Se ve pero no se puede elegir.
   *
   * Se enseña en vez de esconderse cuando la opción EXISTE y todavía no está:
   * quitarla haría pensar que la aplicación no sabe hacer eso; apagada dice
   * que sabrá. `nota` es el porqué, en dos palabras.
   */
  disabled?: boolean;
  note?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={isDisabled}
      aria-disabled={isDisabled}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors',
        // Una fila de menú son 36 de puntero. Con el dedo, 42.
        'movil:min-h-[42px]',
        isDisabled
          ? 'cursor-not-allowed text-muted-foreground opacity-60'
          : isDestructive
            ? 'font-medium text-destructive hover:bg-destructive/10'
            : // ── Elegida y señalada NO son el mismo color ─────────────────────
              // Lo elegido se queda en `muted`, que es la superficie quieta; lo
              // que está bajo el cursor pasa a `accent`, que es la del tema para
              // lo que responde. Con `muted` en los dos, pasar por encima de la
              // opción ya elegida no cambiaba nada y el menú parecía trabado.
              isSelected
              ? cn('bg-muted font-medium text-foreground', HIGHLIGHT)
              : cn('text-foreground', HIGHLIGHT),
      )}
    >
      {Icon && <Icon className="size-4 shrink-0 opacity-70" aria-hidden={true} />}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {note && <span className="shrink-0 text-xs text-muted-foreground">{note}</span>}
      {isSelected && <Check className="size-4 shrink-0 text-primary" aria-hidden={true} />}
    </button>
  );
}
