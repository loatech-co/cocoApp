import type { RefObject } from 'react';

import {
  CANVAS_HEIGHT,
  area,
  xAt,
  bucketLabel,
  longDate,
  line,
  yAt,
  unit,
} from '@/features/transactions/model/trend';
import { type TrendPoint } from '@/shared/api/generated/model';
import { formatCOP } from '@/shared/lib/format';
import { t } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { FLOATING_SURFACE } from '@/shared/ui/foundations/surface';

/** Average and peak, above the chart. */
export function TrendSummary({
  granularity,
  average,
  max,
  pico,
}: {
  granularity: 'dia' | 'mes';
  average: number;
  max: number;
  pico: TrendPoint;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-xs text-muted-foreground">
      <span>
        {t('transactions.trend.averagePer', { unit: unit(granularity) })}
        <strong className="tabular font-semibold text-foreground">{formatCOP(average)}</strong>
      </span>
      <span>
        {t('transactions.trend.peak')}
        <strong className="tabular font-semibold text-foreground">{formatCOP(max)}</strong>
        {t('transactions.trend.peakOn', { bucket: bucketLabel(pico.bucket) })}
      </span>
    </div>
  );
}

/** The two series drawn: expense with its fill and, if there is any, income. */
export function TrendLines({
  expenses,
  income,
  hasIncome,
  ceiling,
  ariaLabel,
}: {
  expenses: number[];
  income: number[];
  hasIncome: boolean;
  ceiling: number;
  ariaLabel: string;
}) {
  const total = expenses.length;

  return (
    <svg
      viewBox="0 0 100 42"
      preserveAspectRatio="none"
      className="h-full w-full"
      role="img"
      aria-label={ariaLabel}
    >
      <ExpenseFill />
      <Guides />

      <path d={area(expenses, ceiling, total)} fill="url(#tendencia-relleno)" />
      <path
        d={line(expenses, ceiling, total)}
        fill="none"
        stroke="var(--color-expense)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />

      {hasIncome && (
        <path
          d={line(income, ceiling, total)}
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

function ExpenseFill() {
  return (
    <defs>
      <linearGradient id="tendencia-relleno" x1="0" y1="0" x2="0" y2="1">
        {/* `--expense` and `--income`, not `--chart-1` and `--chart-2`.
          The chart ramp is a series of colors that tell apart
          FROM EACH OTHER; here the two series are not just any two series,
          they are what goes out and what comes in, and that already has a color in this
          app. With the ramp, expense came out teal in the chart and pine in
          the table, and income gold here and green there: the same money
          in four colors depending on where you looked.

          The donut does keep its own ramp, and for a reason that
          does not apply here: it paints AREAS, and a color that stands out as a
          2px stroke can be invisible as a fill. */}
        <stop offset="0%" stopColor="var(--color-expense)" stopOpacity="0.25" />
        <stop offset="100%" stopColor="var(--color-expense)" stopOpacity="0.02" />
      </linearGradient>
    </defs>
  );
}

/** Three guides: without them you cannot compare the height of a point with that of another one far away. */
function Guides() {
  return (
    <>
      {[0.25, 0.5, 0.75].map((f) => (
        <line
          key={f}
          x1="0"
          x2="100"
          y1={CANVAS_HEIGHT * f}
          y2={CANVAS_HEIGHT * f}
          stroke="var(--color-border)"
          strokeWidth="0.25"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </>
  );
}

/** The highlighted point on the line. */
export function Point({
  x,
  value,
  ceiling,
  color,
}: {
  x: number;
  value: number;
  ceiling: number;
  color: string;
}) {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card"
      style={{
        left: `${x}%`,
        top: `${(yAt(value, ceiling) / CANVAS_HEIGHT) * 100}%`,
        backgroundColor: color,
      }}
    />
  );
}

/*
  The card jumps to the side OPPOSITE the pointer instead of following it.
  Following it, it would run off the chart at the ends, and it would cover
  exactly the point being looked at.
*/
export function TrendCard({
  card,
  point,
  position,
  isMeasured,
  hasIncome,
}: {
  card: RefObject<HTMLDivElement | null>;
  point: TrendPoint;
  position: { left: number; top: number };
  isMeasured: boolean;
  hasIncome: boolean;
}) {
  return (
    <div
      ref={card}
      style={{ left: `${position.left}px`, top: `${position.top}px` }}
      className={cn(
        'pointer-events-none absolute min-w-36 rounded-lg p-3',
        FLOATING_SURFACE,
        // Not yet measured, it is drawn invisible: a first frame in
        // the corner and another in its place looks like a jump.
        !isMeasured && 'opacity-0',
      )}
    >
      <p className="text-xs font-semibold text-muted-foreground">{longDate(point.bucket)}</p>
      <p className="tabular mt-1 font-display text-base font-semibold">
        {formatCOP(Number(point.expense))}
      </p>
      {hasIncome && Number(point.income) > 0 && (
        <p className="tabular mt-0.5 text-xs text-income">
          {t('transactions.trend.ofIncome', { amount: formatCOP(Number(point.income)) })}
        </p>
      )}
      <p className="mt-1 text-2xs text-muted-foreground">
        {point.count === 1
          ? t('transactions.trend.movementsOne', { n: point.count })
          : t('transactions.trend.movementsMany', { n: point.count })}
      </p>
    </div>
  );
}

/*
  The axis. The labels are PLACED by their position, not spread in
  equal columns: spread out, thirty days leave eleven pixels per
  label and the numbers step on each other.
*/
export function TrendAxis({
  labels,
  total,
}: {
  labels: { index: number; text: string }[];
  total: number;
}) {
  return (
    <div className="relative h-4">
      {labels.map(({ index, text }) => (
        <span
          key={index}
          className="absolute -translate-x-1/2 whitespace-nowrap text-2xs text-muted-foreground"
          style={{ left: `${xAt(index, total)}%` }}
        >
          {text}
        </span>
      ))}
    </div>
  );
}
