import { formatCOP } from '@/lib/utils';
import { cn } from '@/lib/utils';

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

export interface PorcionDeDona {
  id: number | null;
  nombre: string;
  valor: number;
}

/**
 * Una dona.
 *
 * ── Por qué dona y no tarta ─────────────────────────────────────────────────
 * El agujero del medio no es adorno: es donde va el total, que es el dato que
 * da sentido a los porcentajes. Sin él habría que escribirlo al lado y leer
 * dos veces.
 *
 * ── Por qué se agrupa la cola en "Otros" ────────────────────────────────────
 * Porque una porción del 1 % en una dona de 120 píxeles mide dos píxeles: no
 * se ve, no se puede pulsar y aun así ocupa una línea en la leyenda. Juntas
 * dicen más como una sola porción que como doce rayitas.
 */
export function Dona({
  porciones,
  total,
  maximo = 4,
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
  // la dona tiene que quedar con un hueco en vez de repartirlo entre las demás.
  const base = total > 0 ? total : segmentos.reduce((s, p) => s + p.valor, 0) || 1;

  // Circunferencia de un radio 42 en un lienzo de 100. Todo se expresa en
  // fracciones de esta longitud: así no hay trigonometría ni arcos a mano.
  const RADIO = 42;
  const VUELTA = 2 * Math.PI * RADIO;

  let recorrido = 0;

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="relative mx-auto w-full max-w-[9.5rem]">
        <svg viewBox="0 0 100 100" className="w-full" role="img" aria-label="Distribución del gasto">
          {/* El aro de fondo: es lo que se ve donde no llega ninguna porción. */}
          <circle
            cx="50"
            cy="50"
            r={RADIO}
            fill="none"
            stroke="var(--color-secondary)"
            strokeWidth="14"
          />

          {segmentos.map((seg) => {
            const fraccion = seg.valor / base;
            const largo = fraccion * VUELTA;
            const desfase = -recorrido * VUELTA;
            recorrido += fraccion;

            return (
              <circle
                key={seg.id ?? seg.nombre}
                cx="50"
                cy="50"
                r={RADIO}
                fill="none"
                stroke={seg.color}
                strokeWidth="14"
                strokeDasharray={`${largo} ${VUELTA - largo}`}
                strokeDashoffset={desfase}
                // Empieza arriba, no a las tres en punto: es donde uno empieza
                // a leer un reloj y también una dona.
                transform="rotate(-90 50 50)"
              />
            );
          })}
        </svg>

        <span className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="tabular font-display text-base font-semibold leading-none">
            {formatCOP(total)}
          </span>
        </span>
      </div>

      <ul className="flex flex-col gap-1.5">
        {segmentos.map((seg) => {
          const porcentaje = Math.round((seg.valor / base) * 100);
          const interactiva = seg.id !== null && onElegir !== undefined;

          const contenido = (
            <span className="flex w-full min-w-0 items-center gap-2 text-left">
              <span
                aria-hidden="true"
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: seg.color }}
              />
              <span className="min-w-0 flex-1 truncate text-sm">{seg.nombre}</span>
              <span className="tabular shrink-0 text-xs text-muted-foreground">{porcentaje}%</span>
            </span>
          );

          return (
            <li key={seg.id ?? seg.nombre}>
              {interactiva ? (
                <button
                  type="button"
                  onClick={() => onElegir(seg.id as number)}
                  className="flex w-full rounded-md py-0.5 transition-opacity hover:opacity-70"
                >
                  {contenido}
                </button>
              ) : (
                <span className="flex py-0.5">{contenido}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
