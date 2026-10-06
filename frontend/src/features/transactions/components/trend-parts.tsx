import type { RefObject } from 'react';

import {
  ALTO_LIENZO,
  area,
  equis,
  etiquetaDeCubo,
  fechaLarga,
  linea,
  ye,
  unidad,
} from '@/features/transactions/model/trend';
import { type TrendPoint } from '@/shared/api/generated/model';
import { formatCOP } from '@/shared/lib/format';
import { t } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { SUPERFICIE_FLOTANTE } from '@/shared/ui/foundations/superficie';

/** Promedio y pico, encima de la gráfica. */
export function TrendSummary({
  granularidad,
  promedio,
  maximo,
  pico,
}: {
  granularidad: 'dia' | 'mes';
  promedio: number;
  maximo: number;
  pico: TrendPoint;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-xs text-muted-foreground">
      <span>
        {t('transactions.trend.averagePer', { unit: unidad(granularidad) })}
        <strong className="tabular font-semibold text-foreground">{formatCOP(promedio)}</strong>
      </span>
      <span>
        {t('transactions.trend.peak')}
        <strong className="tabular font-semibold text-foreground">{formatCOP(maximo)}</strong>
        {t('transactions.trend.peakOn', { bucket: etiquetaDeCubo(pico.bucket) })}
      </span>
    </div>
  );
}

/** Las dos series dibujadas: el gasto con su relleno y, si lo hay, el ingreso. */
export function TrendLines({
  gastos,
  ingresos,
  hayIngresos,
  techo,
  ariaLabel,
}: {
  gastos: number[];
  ingresos: number[];
  hayIngresos: boolean;
  techo: number;
  ariaLabel: string;
}) {
  const total = gastos.length;

  return (
    <svg
      viewBox="0 0 100 42"
      preserveAspectRatio="none"
      className="h-full w-full"
      role="img"
      aria-label={ariaLabel}
    >
      <RellenoDelGasto />
      <Guias />

      <path d={area(gastos, techo, total)} fill="url(#tendencia-relleno)" />
      <path
        d={linea(gastos, techo, total)}
        fill="none"
        stroke="var(--color-expense)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />

      {hayIngresos && (
        <path
          d={linea(ingresos, techo, total)}
          fill="none"
          stroke="var(--color-income)"
          strokeWidth="1.75"
          strokeDasharray="4 3"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
}

function RellenoDelGasto() {
  return (
    <defs>
      <linearGradient id="tendencia-relleno" x1="0" y1="0" x2="0" y2="1">
        {/* `--expense` y `--income`, no `--chart-1` y `--chart-2`.
          La rampa de gráficas es una serie de colores que se distinguen
          ENTRE SÍ; aquí las dos series no son dos series cualesquiera,
          son lo que sale y lo que entra, y eso ya tiene color en esta
          app. Con la rampa, el gasto salía teal en la gráfica y pino en
          la tabla, y el ingreso oro aquí y verde allá: la misma plata
          con cuatro colores según por dónde se mirara.

          La dona sí se queda con su propia rampa, y por un motivo que
          aquí no aplica: pinta ÁREAS, y un color que se distingue como
          trazo de 2px puede ser invisible como relleno. */}
        <stop offset="0%" stopColor="var(--color-expense)" stopOpacity="0.25" />
        <stop offset="100%" stopColor="var(--color-expense)" stopOpacity="0.02" />
      </linearGradient>
    </defs>
  );
}

/** Tres guías: sin ellas no se puede comparar la altura de un punto con la de otro que esté lejos. */
function Guias() {
  return (
    <>
      {[0.25, 0.5, 0.75].map((f) => (
        <line
          key={f}
          x1="0"
          x2="100"
          y1={ALTO_LIENZO * f}
          y2={ALTO_LIENZO * f}
          stroke="var(--color-border)"
          strokeWidth="0.25"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </>
  );
}

/** El punto resaltado sobre la línea. */
export function Punto({
  x,
  valor,
  techo,
  color,
}: {
  x: number;
  valor: number;
  techo: number;
  color: string;
}) {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card"
      style={{
        left: `${x}%`,
        top: `${(ye(valor, techo) / ALTO_LIENZO) * 100}%`,
        backgroundColor: color,
      }}
    />
  );
}

/*
  La tarjeta salta al lado CONTRARIO del puntero en vez de seguirlo.
  Siguiéndolo se saldría del gráfico en los extremos, y taparía
  justo el punto que se está mirando.
*/
export function TrendCard({
  tarjeta,
  punto,
  sitio,
  medida,
  hayIngresos,
}: {
  tarjeta: RefObject<HTMLDivElement | null>;
  punto: TrendPoint;
  sitio: { left: number; top: number };
  medida: boolean;
  hayIngresos: boolean;
}) {
  return (
    <div
      ref={tarjeta}
      style={{ left: `${sitio.left}px`, top: `${sitio.top}px` }}
      className={cn(
        'pointer-events-none absolute min-w-36 rounded-lg p-3',
        SUPERFICIE_FLOTANTE,
        // Sin medir todavía se pinta invisible: un primer fotograma en
        // la esquina y otro en su sitio se ve como un salto.
        !medida && 'opacity-0',
      )}
    >
      <p className="text-xs font-semibold text-muted-foreground">{fechaLarga(punto.bucket)}</p>
      <p className="tabular mt-1 font-display text-base font-semibold">
        {formatCOP(Number(punto.expense))}
      </p>
      {hayIngresos && Number(punto.income) > 0 && (
        <p className="tabular mt-0.5 text-xs text-income">
          {t('transactions.trend.ofIncome', { amount: formatCOP(Number(punto.income)) })}
        </p>
      )}
      <p className="mt-1 text-2xs text-muted-foreground">
        {punto.count === 1
          ? t('transactions.trend.movementsOne', { n: punto.count })
          : t('transactions.trend.movementsMany', { n: punto.count })}
      </p>
    </div>
  );
}

/*
  El eje. Las etiquetas se COLOCAN por su posición, no se reparten en
  columnas iguales: repartidas, treinta días dejan once píxeles por
  etiqueta y los números se pisan unos con otros.
*/
export function TrendAxis({
  etiquetas,
  total,
}: {
  etiquetas: { indice: number; texto: string }[];
  total: number;
}) {
  return (
    <div className="relative h-4">
      {etiquetas.map(({ indice, texto }) => (
        <span
          key={indice}
          className="absolute -translate-x-1/2 whitespace-nowrap text-2xs text-muted-foreground"
          style={{ left: `${equis(indice, total)}%` }}
        >
          {texto}
        </span>
      ))}
    </div>
  );
}
