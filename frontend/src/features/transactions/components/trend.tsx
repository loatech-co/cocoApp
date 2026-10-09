import { ChartLine } from 'lucide-react';

import { cardPosition, useTrendPointer } from '@/features/transactions/hooks/use-trend-pointer';
import { xAt, bucketLabel, axisLabels, unit } from '@/features/transactions/model/trend';
import { type TrendPoint } from '@/shared/api/generated/model';
import { formatCOP } from '@/shared/lib/format';
import { t } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { EmptyState } from '@/shared/ui/atoms/empty-state';
import { Skeleton } from '@/shared/ui/atoms/skeleton';

import { Point, TrendAxis, TrendCard, TrendLines, TrendSummary } from './trend-parts';

/**
 * How spending behaves, in one line.
 *
 * ── A line, not bars ────────────────────────────────────────────────────────
 * What matters here is the TREND: whether spending goes up or down month by month. The
 * line says it at a glance; a bar forces comparing heights in pairs.
 *
 * ── Why hand-written SVG ────────────────────────────────────────────────────
 * A charting library weighs more than the rest of the app put together, and brings its
 * own palette and its own typeface to fight against.
 */
export function Trend({
  points,
  granularity,
}: {
  points: TrendPoint[];
  granularity: 'dia' | 'mes';
}) {
  // Empty buckets come from the API on purpose —a blank month has to
  // look flat inside a series—, but if ALL of them are zero there is no series
  // to draw: a line stuck to the floor claims "you spent zero", which is not the
  // same as "there is nothing to show".
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

/** The figures that come out of the series: the canvas ceiling, the average and the peak. */
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
  // `max` comes from `expenses`, so it is always found: the fallback is not used.
  const pico = points[s.expenses.indexOf(s.max)] ?? first;
  const period = unit(granularity);

  return (
    // `h-full` and the canvas in `flex-1`: the card is stretched by its neighbor
    // next to it, and a fixed-height chart left half the card blank below.
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
            from: bucketLabel(first.bucket),
            to: bucketLabel(last.bucket),
            average: formatCOP(s.average),
            peak: formatCOP(s.max),
          })}
        />
      </Canvas>

      <TrendAxis labels={axisLabels(points, granularity)} total={points.length} />
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
  const { canvas, card, active, setActive, box, cardSize, point, withKeyboard } = useTrendPointer(
    points.length,
  );
  const activePoint = active === null ? null : points[active];

  return (
    /*
      The canvas and what is overlaid share the same coordinate
      system: 0–100 across. That is why the guide, the point and the card
      are placed in HTML with `left: x%` instead of being drawn inside the SVG —
      the SVG stretches without keeping its aspect ratio, and in there a circle
      would come out squashed and a text distorted.
    */
    <div
      ref={canvas}
      // `min-h-0` lets flex shrink it; without it the child imposes its minimum
      // height and the container overflows.
      className={cn(
        'relative min-h-40 min-w-0 flex-1 touch-pan-y rounded-lg',
        // The chart IS in the tab order and is walked with the
        // arrows —its own label says so—, but it carried `outline-none`
        // with nothing replacing it: whoever got here with the keyboard had
        // no way of knowing. The ring goes inside because the chart
        // fills its card to the edge.
        'outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
      )}
      tabIndex={0}
      role="application"
      aria-label={t('transactions.trend.pointerLabel', { unit: unit(granularity) })}
      onPointerDown={(e) => point(e.clientX)}
      onPointerMove={(e) => point(e.clientX)}
      onPointerLeave={() => setActive(null)}
      onKeyDown={withKeyboard}
      onBlur={() => setActive(null)}
    >
      {children}

      {activePoint && active !== null && (
        <Highlighted
          point={activePoint}
          index={active}
          total={points.length}
          ceiling={ceiling}
          hasIncome={hasIncome}
          card={card}
          box={box}
          cardSize={cardSize}
        />
      )}
    </div>
  );
}

/** The vertical guide, the points and the card of the pointed point. */
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
  box: { width: number; height: number };
  cardSize: { width: number; height: number };
}) {
  const x = xAt(index, total);
  const value = Number(point.expense);
  const position = cardPosition({
    index,
    total,
    value,
    ceiling,
    box,
    cardSize,
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
        isMeasured={cardSize.width !== 0}
        hasIncome={hasIncome}
      />
    </>
  );
}

/**
 * The chart while its data arrives.
 *
 * With the same shape as the real chart: header, canvas that stretches
 * and row of labels. A skeleton of another size makes the page
 * jump right when the data arrives, which is the moment someone is about
 * to press something.
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
