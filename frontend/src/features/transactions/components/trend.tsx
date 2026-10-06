import { ChartLine } from 'lucide-react';

import { sitioDeLaTarjeta, useTrendPointer } from '@/features/transactions/hooks/use-trend-pointer';
import {
  equis,
  etiquetaDeCubo,
  etiquetasDelEje,
  unidad,
} from '@/features/transactions/model/trend';
import { type TrendPoint } from '@/shared/api/generated/model';
import { formatCOP } from '@/shared/lib/format';
import { t } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { EmptyState } from '@/shared/ui/atoms/empty-state';
import { Skeleton } from '@/shared/ui/atoms/skeleton';

import { Point, TrendAxis, TrendCard, TrendLines, TrendSummary } from './trend-parts';

/**
 * El comportamiento del gasto, en una línea.
 *
 * ── Línea, no barras ────────────────────────────────────────────────────────
 * Lo que interesa aquí es la TENDENCIA: si el gasto sube o baja mes a mes. La
 * línea lo dice de un vistazo; una barra obliga a comparar alturas de a pares.
 *
 * ── Por qué SVG a mano ──────────────────────────────────────────────────────
 * Una librería de gráficas pesa más que el resto de la app junta, y trae su
 * propia paleta y su propia tipografía contra las que hay que pelear.
 */
export function Trend({
  points,
  granularity,
}: {
  points: TrendPoint[];
  granularity: 'dia' | 'mes';
}) {
  // Los cubos vacíos vienen a propósito de la API —un mes en blanco tiene que
  // verse plano dentro de una serie—, pero si TODOS están en cero no hay serie
  // que dibujar: una línea pegada al suelo afirma "gastaste cero", que no es lo
  // mismo que "no hay nada que mostrar".
  const isEmpty = points.every((p) => Number(p.expense) === 0 && Number(p.income) === 0);

  const first = points[0];
  const last = points[points.length - 1];

  if (first === undefined || last === undefined || isEmpty) {
    return (
      <EmptyState
        className="h-full"
        Icon={ChartLine}
        title={t('transactions.trend.emptyTitle')}
        description={t('transactions.trend.emptyHelp')}
      />
    );
  }

  return <Chart points={points} granularity={granularity} extremes={{ first, last }} />;
}

/** Las cifras que salen de la serie: el techo del lienzo, el promedio y el pico. */
function summary(points: TrendPoint[]) {
  const expenses = points.map((p) => Number(p.expense));
  const income = points.map((p) => Number(p.income));
  const hasIncome = income.some((v) => v > 0);
  const ceiling = Math.max(...expenses, ...(hasIncome ? income : [0]), 1);

  const total = expenses.reduce((s, v) => s + v, 0);
  const average = total / points.length;
  const max = Math.max(...expenses);
  return { expenses, income, hasIncome, ceiling, average, max };
}

function Chart({
  points,
  granularity,
  extremes: { first, last },
}: {
  points: TrendPoint[];
  granularity: 'dia' | 'mes';
  extremes: { first: TrendPoint; last: TrendPoint };
}) {
  const s = summary(points);
  // `maximo` sale de `gastos`, así que siempre se encuentra: el respaldo no se usa.
  const pico = points[s.expenses.indexOf(s.max)] ?? first;
  const period = unidad(granularity);

  return (
    // `h-full` y el lienzo en `flex-1`: la tarjeta la estira su vecina de al
    // lado, y una gráfica de alto fijo dejaba media tarjeta en blanco debajo.
    <div className="flex h-full flex-col gap-4">
      <TrendSummary granularity={granularity} average={s.average} max={s.max} pico={pico} />

      <Canvas points={points} granularity={granularity} summary={s}>
        <TrendLines
          expenses={s.expenses}
          income={s.income}
          hasIncome={s.hasIncome}
          ceiling={s.ceiling}
          ariaLabel={t('transactions.trend.chartLabel', {
            unit: period,
            from: etiquetaDeCubo(first.bucket),
            to: etiquetaDeCubo(last.bucket),
            average: formatCOP(s.average),
            peak: formatCOP(s.max),
          })}
        />
      </Canvas>

      <TrendAxis labels={etiquetasDelEje(points, granularity)} total={points.length} />
    </div>
  );
}

function Canvas({
  points,
  granularity,
  summary: { ceiling, hasIncome },
  children,
}: {
  points: TrendPoint[];
  granularity: 'dia' | 'mes';
  summary: ReturnType<typeof summary>;
  children: React.ReactNode;
}) {
  const { lienzo, tarjeta, activo, setActivo, caja, tamTarjeta, apuntar, conTeclado } =
    useTrendPointer(points.length);
  const point = activo === null ? null : points[activo];

  return (
    /*
      El lienzo y lo que se superpone comparten el mismo sistema de
      coordenadas: 0–100 a lo ancho. Por eso la guía, el punto y la tarjeta
      se colocan en HTML con `left: x%` en vez de dibujarse dentro del SVG —
      el SVG se estira sin conservar la proporción, y ahí dentro un círculo
      saldría aplastado y un texto deformado.
    */
    <div
      ref={lienzo}
      // `min-h-0` deja que el flex lo encoja; sin eso el hijo impone su alto
      // mínimo y el contenedor se desborda.
      className={cn(
        'relative min-h-40 min-w-0 flex-1 touch-pan-y rounded-lg',
        // La gráfica ENTRA en el orden del tabulador y se recorre con las
        // flechas —lo dice su propia etiqueta—, pero llevaba `outline-none`
        // sin nada que lo reemplazara: quien llegaba aquí con el teclado no
        // tenía forma de saberlo. El anillo va por dentro porque la gráfica
        // llena su tarjeta hasta el borde.
        'outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
      )}
      tabIndex={0}
      role="application"
      aria-label={t('transactions.trend.pointerLabel', { unit: unidad(granularity) })}
      onPointerDown={(e) => apuntar(e.clientX)}
      onPointerMove={(e) => apuntar(e.clientX)}
      onPointerLeave={() => setActivo(null)}
      onKeyDown={conTeclado}
      onBlur={() => setActivo(null)}
    >
      {children}

      {point && activo !== null && (
        <Highlighted
          point={point}
          index={activo}
          total={points.length}
          ceiling={ceiling}
          hasIncome={hasIncome}
          card={tarjeta}
          box={caja}
          cardSize={tamTarjeta}
        />
      )}
    </div>
  );
}

/** La guía vertical, los puntos y la tarjeta del punto señalado. */
function Highlighted({
  point,
  index,
  total,
  ceiling,
  hasIncome,
  card,
  box,
  cardSize,
}: {
  point: TrendPoint;
  index: number;
  total: number;
  ceiling: number;
  hasIncome: boolean;
  card: React.RefObject<HTMLDivElement | null>;
  box: { ancho: number; alto: number };
  cardSize: { ancho: number; alto: number };
}) {
  const x = equis(index, total);
  const value = Number(point.expense);
  const position = sitioDeLaTarjeta({
    indice: index,
    total,
    valor: value,
    techo: ceiling,
    caja: box,
    tamTarjeta: cardSize,
  });

  return (
    <>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 w-px bg-border"
        style={{ left: `${x}%` }}
      />
      <Point x={x} value={value} ceiling={ceiling} color="var(--color-expense)" />
      {hasIncome && Number(point.income) > 0 && (
        <Point x={x} value={Number(point.income)} ceiling={ceiling} color="var(--color-income)" />
      )}
      <TrendCard
        card={card}
        point={point}
        position={position}
        isMeasured={cardSize.ancho !== 0}
        hasIncome={hasIncome}
      />
    </>
  );
}

/**
 * La gráfica mientras llega su dato.
 *
 * Con la misma forma que la gráfica de verdad: cabecera, lienzo que se estira
 * y fila de etiquetas. Un esqueleto de otro tamaño hace que la página dé un
 * salto justo cuando llegan los datos, que es el momento en que alguien está a
 * punto de pulsar algo.
 */
export function TrendSkeleton() {
  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex gap-6">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-4 w-32" />
      </div>
      <Skeleton className="min-h-40 w-full flex-1 rounded-lg" />
      <div className="flex justify-between">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-3 w-8" />
        ))}
      </div>
      <Skeleton className="h-3 w-24" />
    </div>
  );
}
