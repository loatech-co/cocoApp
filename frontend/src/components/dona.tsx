import { useLayoutEffect, useRef, useState } from 'react';

import { cn, formatCOP } from '@/lib/utils';
import { SUPERFICIE_FLOTANTE } from '@/components/ui/superficie';

/**
 * Los colores de las porciones. Viven en `index.css` porque cambian con el
 * tema: en claro la primera es el pino de la marca, y en oscuro tiene que ser
 * clara o la porción se confunde con la tarjeta y la dona parece vacía.
 *
 * Y son una rampa PROPIA, distinta de la del tema: estas porciones pintan
 * áreas grandes, y un color que se distingue bien como trazo de 2px puede ser
 * invisible como relleno.
 */
const PALETA = [
  'var(--dona-1)',
  'var(--dona-2)',
  'var(--dona-3)',
  'var(--dona-4)',
  'var(--dona-5)',
];
/*
  ── El lienzo es CUADRADO y ajustado al aro ─────────────────────────────────
  Los nombres viven fuera del SVG, en su propia lista, así que el dibujo no
  necesita reservar sitio para ellos. Antes el lienzo era mucho más ancho que
  el aro —para que cupieran los rótulos y sus líneas— y el aro terminaba
  ocupando menos de la mitad de lo que medía la tarjeta.
*/
const RADIO = 68;
const GROSOR = 26;
const LADO = (RADIO + GROSOR / 2) * 2 + 4;
const CENTRO = LADO / 2;
/** El perímetro del aro. Es la unidad en la que se miden los guiones. */
export const VUELTA = 2 * Math.PI * RADIO;

export interface ArcoDeLaDona extends PorcionDeDona {
  color: string;
  fraccion: number;
  porcentaje: number;
  /** Largo del guion, en unidades de perímetro: de su sitio al final. */
  largo: number;
  /** Desplazamiento del patrón. Negativo: el guion se corre hacia adelante. */
  desfase: number;
}

/**
 * Los arcos de la dona, en orden de pintado.
 *
 * Es una función aparte y no un cálculo dentro del componente porque es
 * geometría: se puede probar con números, y lo que hace falta comprobar son
 * invariantes que a ojo no se ven —que el período del patrón siga siendo la
 * vuelta entera, que una porción de cero no dibuje nada, que nada se pase de
 * una vuelta—. Es la misma razón por la que las celdas del mes y los números
 * del paginador viven fuera de sus componentes.
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
 * ── Por qué cada porción se pinta hasta el FINAL ───────────────────────────
 * Cada porción es su propio círculo con su patrón de guiones y el trazo tiene
 * el tope PLANO. Pintada cada una solo en su sitio, donde una acaba y la
 * siguiente empieza las dos se tocan en el mismo punto exacto: ningún trazo
 * cubre ese píxel entero, el suavizado deja pasar el aro de fondo y aparece
 * un escalón oscuro cruzando el anillo. Con 26px de grosor sobre 68 de radio
 * ese escalón mide lo bastante como para parecer parte del dibujo.
 *
 * Así que cada porción no termina donde le toca: sigue hasta donde terminan
 * TODOS los datos, y la siguiente la tapa desde su sitio. El aro se construye
 * por capas, como quien pinta una pared y luego otra encima.
 *
 * De ahí salen tres cosas, y las tres importan:
 *
 * · Cada corte es UN SOLO canto —el de la porción de encima— apoyado sobre un
 *   color opaco, nunca sobre el fondo. No hay nada que el suavizado pueda
 *   dejar pasar, y el corte es recto por construcción y no por un ajuste.
 * · El hueco de lo que falta por clasificar sigue estando, porque las capas
 *   terminan donde terminan los datos y no donde termina el aro.
 * · Señalar una porción tiene que atenuar con COLOR y no con opacidad. Con
 *   capas, una porción translúcida enseña lo que tiene debajo, que es la
 *   porción anterior entera. Está en el `stroke` del componente.
 *
 * Antes esto se resolvía al revés —cada arco se metía 0.75 unidades por
 * debajo del anterior— y tenía dos fallos que las capas no pueden tener: el
 * de la primera porción daba la vuelta y se comía parte del hueco, y en
 * cuanto algo bajaba de opacidad el solape asomaba pegado al corte.
 */
export function arcosDeLaDona(porciones: PorcionDeDona[], total: number): ArcoDeLaDona[] {
  const segmentos = [...porciones]
    .sort((a, b) => b.valor - a.valor)
    .map((p, i) => ({ ...p, color: PALETA[i % PALETA.length] }));

  const suma = segmentos.reduce((s, p) => s + p.valor, 0);
  const base = total > 0 ? total : suma || 1;

  // Dónde acaban los datos. Nunca más de una vuelta: si las porciones suman
  // más que el total —redondeos—, el aro cierra y ya está. Un
  // `strokeDasharray` con el hueco en negativo es inválido, y el navegador que
  // lo rechaza deja el aro entero pintado.
  const fin = Math.min(1, suma / base);

  let recorrido = 0;

  return segmentos.map((seg) => {
    const fraccion = seg.valor / base;
    const desde = recorrido;
    recorrido += fraccion;

    return {
      ...seg,
      fraccion,
      porcentaje: Math.round(fraccion * 100),
      // Desde su sitio hasta el final de los datos. Lo que sobra se lo come
      // la porción siguiente, que se pinta después y encima.
      largo: Math.max(0, fin - desde) * VUELTA,
      desfase: -desde * VUELTA,
    };
  });
}

export interface PorcionDeDona {
  id: number | null;
  nombre: string;
  valor: number;
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
export function Dona({
  porciones,
  total,
  mostrarLista = true,
  onElegir,
  className,
}: {
  porciones: PorcionDeDona[];
  /** El total del recorte. Manda sobre la suma de las porciones. */
  total: number;
  /** Con la lista oculta, el aro se centra pero NO cambia de tamaño. */
  mostrarLista?: boolean;
  onElegir?: (id: number) => void;
  className?: string;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const tarjeta = useRef<HTMLDivElement>(null);
  const [activa, setActiva] = useState<number | null>(null);
  const [puntero, setPuntero] = useState({ x: 0, y: 0 });
  const [medida, setMedida] = useState({ ancho: 0, alto: 0 });
  const [tam, setTam] = useState({ ancho: 0, alto: 0 });

  // Se mide después de pintar y antes de que el navegador dibuje: en el render
  // la tarjeta todavía no existe, y en un efecto normal se vería un fotograma
  // con ella en el sitio equivocado.
  useLayoutEffect(() => {
    if (!tarjeta.current) return;
    const { offsetWidth, offsetHeight } = tarjeta.current;
    setTam((previo) =>
      previo.ancho === offsetWidth && previo.alto === offsetHeight
        ? previo
        : { ancho: offsetWidth, alto: offsetHeight },
    );
  }, [activa]);

  const trazos = arcosDeLaDona(porciones, total);

  function seguir(e: React.PointerEvent): void {
    const r = caja.current?.getBoundingClientRect();
    if (!r) return;
    setMedida({ ancho: r.width, alto: r.height });
    setPuntero({ x: e.clientX - r.left, y: e.clientY - r.top });
  }

  const señalada = activa === null ? null : trazos[activa];

  // La tarjeta salta al lado contrario del puntero cuando no cabe: siguiéndolo
  // sin más se sale de la tarjeta en los bordes.
  const sitio = {
    left: Math.max(
      0,
      puntero.x + 14 + tam.ancho <= medida.ancho ? puntero.x + 14 : puntero.x - 14 - tam.ancho,
    ),
    top: Math.min(Math.max(0, puntero.y - tam.alto / 2), Math.max(0, medida.alto - tam.alto)),
  };

  return (
    <div
      ref={caja}
      className={cn('relative flex h-full items-center gap-4', className)}
      onPointerMove={seguir}
      onPointerLeave={() => setActiva(null)}
    >
      {/* La lista se desplaza dentro de su tarjeta. Sin esto, con doce
          conceptos crecía más que la fila y se derramaba por debajo,
          montándose sobre la tabla de movimientos. */}
      {mostrarLista && (
        <ul className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-y-auto">
        {trazos.map((seg, i) => {
          const puedeBajar = seg.id !== null && onElegir !== undefined;

          return (
            <li key={seg.id ?? seg.nombre}>
              <button
                type="button"
                disabled={!puedeBajar}
                title={seg.nombre}
                onPointerEnter={() => setActiva(i)}
                onClick={() => puedeBajar && onElegir(seg.id as number)}
                className={cn(
                  'flex w-full min-w-0 items-center gap-2 rounded-md text-left transition-opacity',
                  puedeBajar ? 'cursor-pointer' : 'cursor-default',
                  activa !== null && activa !== i && 'opacity-40',
                )}
              >
                <span
                  aria-hidden="true"
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: seg.color }}
                />
                <span className="min-w-0 flex-1 truncate text-sm">{seg.nombre}</span>
              </button>
            </li>
          );
        })}
      </ul>
      )}

      <svg
        viewBox={`0 0 ${LADO} ${LADO}`}
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
        className={cn('max-h-full w-[62%] shrink-0', !mostrarLista && 'mx-auto')}
        role="img"
        aria-label="Distribución del gasto"
      >
        {/* El aro de fondo: es lo que se ve donde no llega ninguna porción. */}
        <circle
          cx={CENTRO}
          cy={CENTRO}
          r={RADIO}
          fill="none"
          stroke="var(--muted)"
          strokeWidth={GROSOR}
        />

        {trazos.map((seg, i) => {
          const puedeBajar = seg.id !== null && onElegir !== undefined;

          return (
            <circle
              key={seg.id ?? seg.nombre}
              cx={CENTRO}
              cy={CENTRO}
              r={RADIO}
              fill="none"
              /*
                ── Atenuar con COLOR, nunca con opacidad ───────────────────
                Señalar una porción apaga las demás. Hacerlo con `opacity`
                las vuelve translúcidas, y debajo de cada una está el solape
                de su vecina: el arco que la precede se le mete 0.75 por
                debajo para taparle la costura. Con la porción opaca eso no
                se ve nunca; en cuanto baja de opacidad, el solape asoma como
                una franja de otro color pegada al corte, y el corte deja de
                verse recto.

                Y pasaba también SIN señalar nada, porque la transición dura
                un momento en el que la opacidad está a medias.

                Mezclando el color con el de la tarjeta se consigue lo mismo
                —el arco se apaga— sin dejar de ser opaco, así que el corte
                es siempre una línea recta. `transition-colors` incluye el
                trazo, así que se sigue apagando poco a poco.
              */
              stroke={
                activa !== null && activa !== i
                  ? `color-mix(in oklab, ${seg.color} 35%, var(--card))`
                  : seg.color
              }
              strokeWidth={GROSOR}
              // Sin patrón cuando da la vuelta entera: un hueco de cero es
              // un patrón que algunos motores rechazan, y lo que hace falta
              // ahí es un círculo y ya.
              strokeDasharray={
                seg.largo >= VUELTA ? undefined : `${seg.largo} ${VUELTA - seg.largo}`
              }
              strokeDashoffset={seg.desfase}
              // Empieza ARRIBA, no a las tres en punto: es donde uno empieza a
              // leer un reloj y también una dona.
              transform={`rotate(-90 ${CENTRO} ${CENTRO})`}
              onPointerEnter={() => setActiva(i)}
              onClick={() => puedeBajar && onElegir(seg.id as number)}
              className={cn('transition-colors', puedeBajar && 'cursor-pointer')}
            />
          );
        })}
      </svg>

      {señalada && (
        <div
          ref={tarjeta}
          style={{ left: `${sitio.left}px`, top: `${sitio.top}px` }}
          className={cn(
            'pointer-events-none absolute z-10 min-w-36 rounded-lg p-3',
            SUPERFICIE_FLOTANTE,
            // Sin medir todavía se pinta invisible: un primer fotograma en la
            // esquina y otro en su sitio se ve como un salto.
            tam.ancho === 0 && 'opacity-0',
          )}
        >
          <p className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <span
              aria-hidden="true"
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: señalada.color }}
            />
            <span className="min-w-0 truncate">{señalada.nombre}</span>
          </p>
          <p className="tabular mt-1 font-display text-base font-semibold">
            {formatCOP(señalada.valor)}
          </p>
          <p className="tabular mt-0.5 text-2xs text-muted-foreground">
            {señalada.porcentaje}% del total
          </p>
        </div>
      )}
    </div>
  );
}
