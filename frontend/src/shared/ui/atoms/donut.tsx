import { useLayoutEffect, useRef, useState, type RefObject } from 'react';

import { formatCOP } from '@/shared/lib/format';
import { t } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { SUPERFICIE_FLOTANTE } from '@/shared/ui/foundations/superficie';

/**
 * Los colores de las porciones. Viven en `index.css` porque cambian con el
 * tema: en claro la primera es el pino de la marca, y en oscuro tiene que ser
 * clara o la porción se confunde con la tarjeta y la dona parece vacía.
 *
 * Y son una rampa PROPIA, distinta de la del tema: estas porciones pintan
 * áreas grandes, y un color que se distingue bien como trazo de 2px puede ser
 * invisible como relleno.
 */
const PALETTE = [
  'var(--dona-1)',
  'var(--dona-2)',
  'var(--dona-3)',
  'var(--dona-4)',
  'var(--dona-5)',
] as const;
/*
  ── El lienzo es CUADRADO y ajustado al aro ─────────────────────────────────
  Los nombres viven fuera del SVG, en su propia lista, así que el dibujo no
  necesita reservar sitio para ellos. Antes el lienzo era mucho más ancho que
  el aro —para que cupieran los rótulos y sus líneas— y el aro terminaba
  ocupando menos de la mitad de lo que medía la tarjeta.
*/
const RADIO = 68;
const THICKNESS = 26;
const SIDE = (RADIO + THICKNESS / 2) * 2 + 4;
const CENTER = SIDE / 2;
/** Los dos cantos del aro. */
const OUTSIDE = RADIO + THICKNESS / 2;
const INSIDE = RADIO - THICKNESS / 2;

export interface DonutArc extends DonutPortion {
  color: string;
  fraction: number;
  percentage: number;
  /** Dónde arranca, en vueltas. 0 son las doce. */
  from: number;
  /** Dónde termina lo que PINTA, que es donde terminan todos los datos. */
  to: number;
}

/**
 * Un punto del aro. `f` va de 0 —las doce— a 1, en el sentido del reloj.
 *
 * Empieza arriba y no a las tres en punto porque es donde uno empieza a leer
 * un reloj y también una dona.
 */
function point(f: number, radio: number): [number, number] {
  const angle = f * 2 * Math.PI - Math.PI / 2;
  return [CENTER + radio * Math.cos(angle), CENTER + radio * Math.sin(angle)];
}

/**
 * El contorno de una porción: un sector de corona, con sus dos cortes RADIALES.
 *
 * ── Por qué un contorno y no un trazo con guiones ───────────────────────────
 * El aro se dibujaba con un círculo por porción, un `stroke` de 26 y un
 * `stroke-dasharray` que dejaba ver solo su trozo. Es la forma corta de
 * escribir una dona y tiene un defecto que no se puede ajustar: el corte de un
 * guion lo pone el navegador PERPENDICULAR A LA TANGENTE del trazo, y esa
 * tangente sale de una curva aproximada por segmentos. Un error de medio grado
 * en la tangente, sobre un trazo que mide 26 de ancho, mueve el canto de fuera
 * varias décimas respecto al de dentro: el corte se ve torcido, o escalonado,
 * según dónde caiga el punto en la aproximación. Con un aro fino no se nota;
 * con uno que mide el 38 % del radio, sí.
 *
 * Un sector no depende de ninguna tangente. Sus dos cortes son el segmento que
 * une el canto de dentro con el de fuera EN EL MISMO ÁNGULO, así que son
 * radiales por construcción y no pueden ser otra cosa.
 *
 * `A` con el barrido a 1 va en el sentido del reloj por el canto de fuera, y a
 * 0 vuelve por el de dentro. El `1` del arco grande hace falta pasada la media
 * vuelta: sin él, el navegador elige el arco corto y la porción sale al revés.
 */
export function donutSector(from: number, to: number): string {
  const sweep = to - from;
  if (sweep <= 0) return '';

  const [x1, y1] = point(from, OUTSIDE);
  const [x2, y2] = point(to, OUTSIDE);
  const [x3, y3] = point(to, INSIDE);
  const [x4, y4] = point(from, INSIDE);
  const largeArc = sweep > 0.5 ? 1 : 0;
  const n = (v: number): string => v.toFixed(3);

  return [
    `M ${n(x1)} ${n(y1)}`,
    `A ${OUTSIDE} ${OUTSIDE} 0 ${largeArc} 1 ${n(x2)} ${n(y2)}`,
    `L ${n(x3)} ${n(y3)}`,
    `A ${INSIDE} ${INSIDE} 0 ${largeArc} 0 ${n(x4)} ${n(y4)}`,
    'Z',
  ].join(' ');
}

/**
 * Los arcos de la dona, en orden de pintado.
 *
 * Es una función aparte y no un cálculo dentro del componente porque es
 * geometría: se puede probar con números, y lo que hace falta comprobar son
 * invariantes que a ojo no se ven —que las capas lleguen todas al mismo sitio,
 * que una porción de cero no dibuje nada, que nada se pase de una vuelta—. Es
 * la misma razón por la que las celdas del mes y los números del paginador
 * viven fuera de sus componentes.
 *
 * ── Todas las porciones, sin agrupar el final en un "Otros" ────────────────
 * Agrupar parecía razonable hasta que se vio en pantalla: "Otros (1)" es un
 * nombre inventado para UNA categoría que sí existe y sí tiene nombre, y
 * además no se podía pulsar —no hay ninguna categoría a la que bajar—, así
 * que era la única fila de la lista que no filtraba nada.
 *
 * ── El total manda sobre la suma de las porciones ──────────────────────────
 * Si hay gasto sin clasificar, el aro queda con un HUECO en vez de repartirlo
 * entre las demás. Un anillo cerrado diría que todo el gasto está en estas
 * categorías, y no lo está.
 *
 * ── Por qué cada porción se pinta hasta el FINAL de los datos ──────────────
 * Dos sectores pegados que comparten un canto dejan pasar el fondo por esa
 * línea: el suavizado reparte el píxel entre los dos y ninguno lo cubre
 * entero, así que aparece un pelo oscuro cruzando el aro.
 *
 * Así que ninguna porción termina donde le toca: todas siguen hasta donde
 * terminan TODOS los datos, y la siguiente las tapa desde su sitio. El aro se
 * construye por capas, como quien pinta una pared y luego otra encima. Cada
 * corte a la vista es entonces el canto de ARRANQUE de la porción de encima
 * —uno solo, y radial— apoyado sobre color opaco y nunca sobre el fondo.
 *
 * Tiene dos consecuencias que no se pueden separar de esto:
 *
 * · El hueco de lo que falta por clasificar sigue estando, porque las capas
 *   terminan donde terminan los datos y no donde termina el aro.
 * · Señalar una porción tiene que atenuar con COLOR y no con opacidad: una
 *   capa translúcida enseña la que tiene debajo, que es la porción anterior
 *   entera.
 */
export function donutArcs(portions: DonutPortion[], total: number): DonutArc[] {
  const segments = [...portions]
    .sort((a, b) => b.value - a.value)
    .map((p, i) => ({ ...p, color: PALETTE[i % PALETTE.length] ?? PALETTE[0] }));

  const sum = segments.reduce((s, p) => s + p.value, 0);
  const base = total > 0 ? total : sum || 1;
  // Dónde acaban los datos. Nunca más de una vuelta: si las porciones suman
  // más que el total —redondeos—, el aro cierra y ya está.
  const end = Math.min(1, sum / base);

  let covered = 0;

  return segments.map((segment) => {
    const fraction = segment.value / base;
    const from = covered;
    covered += fraction;

    return {
      ...segment,
      fraction,
      percentage: Math.round(fraction * 100),
      from: Math.min(from, end),
      to: end,
    };
  });
}

export interface DonutPortion {
  id: number | null;
  name: string;
  value: number;
}

/**
 * En qué se reparte el gasto: una lista y un aro.
 *
 * ── Por qué la lista y no rótulos alrededor ─────────────────────────────────
 * Se intentó con nombres alrededor del aro unidos por líneas. En una tarjeta
 * de un tercio de pantalla no entra: o los nombres se cortan hasta dejar de
 * decir nada, o el aro se encoge hasta que la proporción —lo único que una
 * dona responde— deja de leerse.
 *
 * Una lista ordenada de mayor a menor responde la misma pregunta mejor: ya
 * viene con el ranking hecho, los nombres caben enteros y el aro se queda con
 * todo el espacio que le sobra a la columna.
 *
 * ── Por qué la lista son solo nombres ───────────────────────────────────────
 * Porque el orden ya dice cuál pesa más y el aro ya dice cuánto. Repetirlo en
 * cifras al lado de cada nombre convierte la lista en una tabla peor que una
 * tabla, y tapa lo único que hay que leer de un vistazo: en qué se va la
 * plata. El cuánto exacto es otra pregunta, y se hace señalando.
 */
export function Donut({
  portions,
  total,
  isListVisible = true,
  onSelect,
  className,
}: {
  portions: DonutPortion[];
  /** El total del recorte. Manda sobre la suma de las porciones. */
  total: number;
  /** Con la lista oculta, el aro se centra pero NO cambia de tamaño. */
  isListVisible?: boolean;
  onSelect?: ((id: number) => void) | undefined;
  className?: string;
}) {
  const { box, card, activeIndex, setActiveIndex, follow, position, isMeasured } =
    useDonutPointer();
  const strokes = donutArcs(portions, total);
  const highlighted = activeIndex === null ? null : strokes[activeIndex];
  const marks = { strokes, activeIndex, setActiveIndex, onSelect };

  return (
    <div
      ref={box}
      className={cn('relative flex h-full items-center gap-4', className)}
      onPointerMove={follow}
      onPointerLeave={() => setActiveIndex(null)}
    >
      {/* La lista se desplaza dentro de su tarjeta. Sin esto, con doce
          conceptos crecía más que la fila y se derramaba por debajo,
          montándose sobre la tabla de movimientos. */}
      {isListVisible && <DonutLegend {...marks} />}

      <DonutRing {...marks} isListVisible={isListVisible} />

      {highlighted && (
        <DonutTooltip
          card={card}
          position={position}
          isMeasured={isMeasured}
          highlighted={highlighted}
        />
      )}
    </div>
  );
}

/** Qué porción está señalada, y lo que hace falta para señalarla o bajar a ella. */
interface DonutMarks {
  strokes: DonutArc[];
  activeIndex: number | null;
  setActiveIndex: (i: number | null) => void;
  onSelect: ((id: number) => void) | undefined;
}

/** El puntero sobre la dona y la tarjeta que lo sigue. */
function useDonutPointer() {
  const box = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [pointer, setPointer] = useState({ x: 0, y: 0 });
  const [bounds, setBounds] = useState({ width: 0, height: 0 });
  const [tipSize, setTipSize] = useState({ width: 0, height: 0 });

  // Se mide después de pintar y antes de que el navegador dibuje: en el render
  // la tarjeta todavía no existe, y en un efecto normal se vería un fotograma
  // con ella en el sitio equivocado.
  useLayoutEffect(() => {
    if (!card.current) return;
    const { offsetWidth, offsetHeight } = card.current;
    setTipSize((previous) =>
      previous.width === offsetWidth && previous.height === offsetHeight
        ? previous
        : { width: offsetWidth, height: offsetHeight },
    );
  }, [activeIndex]);

  function follow(e: React.PointerEvent): void {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    setBounds({ width: r.width, height: r.height });
    setPointer({ x: e.clientX - r.left, y: e.clientY - r.top });
  }

  // La tarjeta salta al lado contrario del puntero cuando no cabe: siguiéndolo
  // sin más se sale de la tarjeta en los bordes.
  const position = {
    left: Math.max(
      0,
      pointer.x + 14 + tipSize.width <= bounds.width
        ? pointer.x + 14
        : pointer.x - 14 - tipSize.width,
    ),
    top: Math.min(
      Math.max(0, pointer.y - tipSize.height / 2),
      Math.max(0, bounds.height - tipSize.height),
    ),
  };

  return {
    box,
    card,
    activeIndex,
    setActiveIndex,
    follow,
    position,
    isMeasured: tipSize.width !== 0,
  };
}

function DonutLegend({ strokes, activeIndex, setActiveIndex, onSelect }: DonutMarks) {
  return (
    <ul className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-y-auto">
      {strokes.map((segment, i) => {
        const canDrillDown = segment.id !== null && onSelect !== undefined;

        return (
          <li key={segment.id ?? segment.name}>
            <button
              type="button"
              disabled={!canDrillDown}
              title={segment.name}
              onPointerEnter={() => setActiveIndex(i)}
              onClick={() => {
                if (segment.id !== null && onSelect !== undefined) onSelect(segment.id);
              }}
              className={cn(
                'flex w-full min-w-0 items-center gap-2 rounded-md text-left transition-opacity',
                canDrillDown ? 'cursor-pointer' : 'cursor-default',
                activeIndex !== null && activeIndex !== i && 'opacity-40',
              )}
            >
              <span
                aria-hidden="true"
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: segment.color }}
              />
              <span className="min-w-0 flex-1 truncate text-sm">{segment.name}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function DonutRing({ isListVisible, ...marks }: DonutMarks & { isListVisible: boolean }) {
  return (
    <svg
      viewBox={`0 0 ${SIDE} ${SIDE}`}
      /*
        El tamaño sale del ANCHO, y el alto lo sigue.

        Sacarlo del alto —`h-80% w-auto`— parecía más fino: la dona llenaba
        su tarjeta. Pero el ancho que salía de ese alto no sabía nada de la
        lista que tiene al lado, así que el aro se llevaba la fila entera y
        los nombres se encogían hasta desaparecer.

        Repartiendo el ANCHO entre los dos, cada uno tiene lo suyo: el aro el
        62 % y la lista el 38 %. `max-h-full` es el freno por si la tarjeta
        resulta más baja que ancha; el lienzo es cuadrado, así que al
        achicarse sigue siendo un círculo, solo que más chico.

        Para agrandar el aro hay dos mandos, y los dos están fuera de este
        archivo o justo aquí: este porcentaje —que se lo quita a la lista— y
        el ancho de la columna en el resumen, que se lo quita a la gráfica.
      */
      // Con la lista oculta el aro se CENTRA, no crece: creciendo, el ancho
      // de la tarjeta dejaría de ser el mismo con y sin nombres y la fila
      // entera se recolocaría cada vez que se pulsa el botón.
      className={cn('max-h-full w-[62%] shrink-0', !isListVisible && 'mx-auto')}
      role="img"
      aria-label={t('ui.donut.label')}
    >
      {/* El aro de fondo: es lo que se ve donde no llega ninguna porción. */}
      <circle
        cx={CENTER}
        cy={CENTER}
        r={RADIO}
        fill="none"
        stroke="var(--muted)"
        strokeWidth={THICKNESS}
      />

      {marks.strokes.map((segment, i) => (
        <DonutSlice key={segment.id ?? segment.name} segment={segment} i={i} {...marks} />
      ))}
    </svg>
  );
}

function DonutSlice({
  segment,
  i,
  activeIndex,
  setActiveIndex,
  onSelect,
}: Omit<DonutMarks, 'trazos'> & { segment: DonutArc; i: number }) {
  const canDrillDown = segment.id !== null && onSelect !== undefined;
  const sweep = segment.to - segment.from;
  if (sweep <= 0) return null;

  /*
    ── Atenuar con COLOR, nunca con opacidad ─────────────────────────
    Señalar una porción apaga las demás. Con `opacity` se vuelven
    translúcidas, y debajo de cada una está la anterior entera —el aro
    se pinta por capas—, así que asomaría por debajo. Mezclando el
    color con el de la tarjeta se apaga igual sin dejar de ser opaca.
    `transition-colors` incluye el relleno, así que sigue siendo
    gradual.
  */
  const color =
    activeIndex !== null && activeIndex !== i
      ? `color-mix(in oklab, ${segment.color} 35%, var(--card))`
      : segment.color;

  const shared = {
    onPointerEnter: () => setActiveIndex(i),
    onClick: () => {
      if (segment.id !== null && onSelect !== undefined) onSelect(segment.id);
    },
    className: cn('transition-colors', canDrillDown && 'cursor-pointer'),
  };

  // La vuelta entera no es un sector: sus dos cortes caerían en el
  // mismo sitio y el arco quedaría indefinido. Ahí es un aro y ya.
  return sweep >= 1 ? (
    <circle
      cx={CENTER}
      cy={CENTER}
      r={RADIO}
      fill="none"
      stroke={color}
      strokeWidth={THICKNESS}
      {...shared}
    />
  ) : (
    <path d={donutSector(segment.from, segment.to)} fill={color} {...shared} />
  );
}

function DonutTooltip({
  card,
  position,
  isMeasured,
  highlighted,
}: {
  card: RefObject<HTMLDivElement | null>;
  position: { left: number; top: number };
  /** Ya se sabe cuánto mide: hasta entonces no se enseña. */
  isMeasured: boolean;
  highlighted: DonutArc;
}) {
  return (
    <div
      ref={card}
      style={{ left: `${position.left}px`, top: `${position.top}px` }}
      className={cn(
        'pointer-events-none absolute z-10 min-w-36 rounded-lg p-3',
        SUPERFICIE_FLOTANTE,
        // Sin medir todavía se pinta invisible: un primer fotograma en la
        // esquina y otro en su sitio se ve como un salto.
        !isMeasured && 'opacity-0',
      )}
    >
      <p className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
        <span
          aria-hidden="true"
          className="size-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: highlighted.color }}
        />
        <span className="min-w-0 truncate">{highlighted.name}</span>
      </p>
      <p className="tabular mt-1 font-display text-base font-semibold">
        {formatCOP(highlighted.value)}
      </p>
      <p className="tabular mt-0.5 text-2xs text-muted-foreground">
        {t('ui.donut.ofTotal', { percent: highlighted.percentage })}
      </p>
    </div>
  );
}
