import { useLayoutEffect, useRef, useState } from 'react';

import { cn, formatCOP } from '@/lib/utils';

/**
 * Los colores de las porciones, en orden.
 *
 * Son los de las gráficas, más un gris para "Otros": el resto agrupado no es
 * una categoría, es lo que no cupo, y pintarlo con un color de la marca lo
 * pondría a competir con las que sí importan.
 */
const COLORES = [
  'var(--color-chart-1)',
  'var(--color-chart-2)',
  'var(--color-chart-3)',
  'var(--color-chart-4)',
  'var(--color-chart-5)',
];
const COLOR_OTROS = 'var(--color-muted-foreground)';

/**
 * Lienzo de 132 con el aro en radio 40.
 *
 * El aro llega hasta 49 desde el centro y las cifras se posan en 62: quedan
 * trece de aire entre el borde del aro y el número. Pegadas al aro parecían
 * parte de la porción y no una medida de ella, y en las porciones estrechas se
 * tocaban con el color.
 */
const CENTRO = 66;
const RADIO = 40;
const GROSOR = 18;
/** Cuánto se separan las cifras del borde exterior del aro. */
const AIRE = 13;
const VUELTA = 2 * Math.PI * RADIO;

/** Por debajo de esto la cifra no cabe sin pisar a la de al lado. */
const MINIMO_PARA_ETIQUETA = 0.05;

export interface PorcionDeDona {
  id: number | null;
  nombre: string;
  valor: number;
}

/**
 * Una dona.
 *
 * ── Por qué el agujero ──────────────────────────────────────────────────────
 * No es adorno: es donde va el total, que es el dato que da sentido a los
 * porcentajes. Sin él habría que escribirlo al lado y leer dos veces.
 *
 * ── Por qué solo porcentajes, y el dinero al pasar por encima ───────────────
 * Porque la dona responde "¿qué proporción?", y una lista de cifras largas al
 * lado de cada porción convierte esa respuesta en una tabla peor que una
 * tabla. El peso exacto es una segunda pregunta, y se hace señalando.
 *
 * ── Por qué se agrupa la cola en "Otros" ────────────────────────────────────
 * Porque una porción del 1 % en un aro de 200 píxeles mide dos: no se ve, no
 * se puede señalar y aun así ocupa sitio. Juntas dicen más como una sola.
 */
export function Dona({
  porciones,
  total,
  maximo = 5,
  onElegir,
  className,
}: {
  porciones: PorcionDeDona[];
  /** El total del recorte, que va en el centro. */
  total: number;
  /** Cuántas porciones se dibujan antes de agrupar el resto. */
  maximo?: number;
  onElegir?: (id: number) => void;
  className?: string;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const tarjeta = useRef<HTMLDivElement>(null);
  const [activa, setActiva] = useState<number | null>(null);
  const [puntero, setPuntero] = useState({ x: 0, y: 0 });
  const [medida, setMedida] = useState({ ancho: 0, alto: 0 });
  const [tam, setTam] = useState({ ancho: 0, alto: 0 });

  useLayoutEffect(() => {
    if (!tarjeta.current) return;
    const { offsetWidth, offsetHeight } = tarjeta.current;
    setTam((previo) =>
      previo.ancho === offsetWidth && previo.alto === offsetHeight
        ? previo
        : { ancho: offsetWidth, alto: offsetHeight },
    );
  }, [activa]);

  const ordenadas = [...porciones].sort((a, b) => b.valor - a.valor);
  const visibles = ordenadas.slice(0, maximo);
  const cola = ordenadas.slice(maximo);
  const sumaCola = cola.reduce((s, p) => s + p.valor, 0);

  const segmentos = [
    ...visibles.map((p, i) => ({ ...p, color: COLORES[i % COLORES.length] })),
    ...(sumaCola > 0
      ? [{ id: null, nombre: `Otros (${cola.length})`, valor: sumaCola, color: COLOR_OTROS }]
      : []),
  ];

  // El total manda sobre la suma de las porciones: si hay gasto sin clasificar,
  // el aro tiene que quedar con un hueco en vez de repartirlo entre las demás.
  const base = total > 0 ? total : segmentos.reduce((s, p) => s + p.valor, 0) || 1;

  // Cada porción con su sitio ya calculado: el ángulo medio es donde va su
  // cifra, y el desfase es por dónde empieza a dibujarse en el aro.
  let recorrido = 0;
  const trazos = segmentos.map((seg) => {
    const fraccion = seg.valor / base;
    const medio = recorrido + fraccion / 2;
    const inicio = recorrido;
    recorrido += fraccion;

    // −90° porque el aro empieza ARRIBA, no a las tres en punto: es donde uno
    // empieza a leer un reloj y también una dona.
    const angulo = medio * 2 * Math.PI - Math.PI / 2;

    return {
      ...seg,
      fraccion,
      largo: fraccion * VUELTA,
      desfase: -inicio * VUELTA,
      etiqueta: {
        x: CENTRO + Math.cos(angulo) * (RADIO + GROSOR / 2 + AIRE),
        y: CENTRO + Math.sin(angulo) * (RADIO + GROSOR / 2 + AIRE),
      },
    };
  });

  function seguir(e: React.PointerEvent): void {
    const r = caja.current?.getBoundingClientRect();
    if (!r) return;
    setMedida({ ancho: r.width, alto: r.height });
    setPuntero({ x: e.clientX - r.left, y: e.clientY - r.top });
  }

  const señalada = activa === null ? null : trazos[activa];

  // La tarjeta salta al lado contrario del puntero cuando no cabe: siguiéndolo
  // sin más se sale del gráfico en los bordes.
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
      className={cn('relative mx-auto w-full max-w-[17rem]', className)}
      onPointerMove={seguir}
      onPointerLeave={() => setActiva(null)}
    >
      <svg viewBox="0 0 132 132" className="w-full" role="img" aria-label="Distribución del gasto">
        {/* El aro de fondo: es lo que se ve donde no llega ninguna porción. */}
        <circle
          cx={CENTRO}
          cy={CENTRO}
          r={RADIO}
          fill="none"
          stroke="var(--color-secondary)"
          strokeWidth={GROSOR}
        />

        {trazos.map((seg, i) => (
          <circle
            key={seg.id ?? seg.nombre}
            cx={CENTRO}
            cy={CENTRO}
            r={RADIO}
            fill="none"
            stroke={seg.color}
            strokeWidth={GROSOR}
            strokeDasharray={`${seg.largo} ${VUELTA - seg.largo}`}
            strokeDashoffset={seg.desfase}
            transform={`rotate(-90 ${CENTRO} ${CENTRO})`}
            onPointerEnter={() => setActiva(i)}
            onClick={() => seg.id !== null && onElegir?.(seg.id)}
            className={cn(
              'transition-opacity',
              seg.id !== null && onElegir && 'cursor-pointer',
              activa !== null && activa !== i && 'opacity-40',
            )}
          />
        ))}

        {/* Las cifras van FUERA del aro, no encima: encima habría que elegir
            texto claro u oscuro según el color de cada porción, y con cinco
            colores siempre hay uno que queda ilegible. */}
        {trazos.map((seg) =>
          seg.fraccion >= MINIMO_PARA_ETIQUETA ? (
            <text
              key={`t-${seg.id ?? seg.nombre}`}
              x={seg.etiqueta.x}
              y={seg.etiqueta.y}
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-muted-foreground text-[7px] font-semibold"
            >
              {Math.round(seg.fraccion * 100)}%
            </text>
          ) : null,
        )}
      </svg>

      <span className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="tabular font-display text-lg font-semibold leading-none">
          {formatCOP(total)}
        </span>
        <span className="mt-1 text-[11px] text-muted-foreground">en total</span>
      </span>

      {señalada && (
        <div
          ref={tarjeta}
          style={{ left: `${sitio.left}px`, top: `${sitio.top}px` }}
          className={cn(
            'pointer-events-none absolute z-10 min-w-36 rounded-xl bg-popover p-3',
            'shadow-[var(--sombra-flotante)] ring-1 ring-black/5 dark:ring-white/12',
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
          <p className="tabular mt-0.5 text-[11px] text-muted-foreground">
            {Math.round(señalada.fraccion * 100)}% del total
          </p>
        </div>
      )}
    </div>
  );
}
