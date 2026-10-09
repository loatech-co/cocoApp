import type { ReactNode } from 'react';

import { Distribution } from '@/features/transactions/components/cost-distribution';
import { PendingPayments } from '@/features/transactions/components/pending-payments';
import { Trend } from '@/features/transactions/components/trend';
import type {
  Category,
  Dashboard,
  DashboardBreakdownLevel,
  PendingPayment,
} from '@/shared/api/generated/model';
import { t } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { Card, CardContent } from '@/shared/ui/atoms/card';

interface RowProps {
  data: Dashboard;
  hasPending: boolean;
  path: Category[];
  onSelectPayment: (payment: PendingPayment) => void;
  onDrillDown: (id: number) => void;
  onDrillUp: () => void;
}

/** The row with the chart, the pending payments and the distribution. */
export function DashboardCharts({
  data,
  hasPending,
  path,
  onSelectPayment,
  onDrillDown,
  onDrillUp,
}: RowProps) {
  /* The chart says WHEN the money was spent and the donut ON WHAT. They are the
      same question split in two, so they go at the same height: one
      below the other forces scrolling to cross-check them. */
  /*
    ── Who rules the height of this row ──────────────────────────────
    The chart. Its canvas has its own ASPECT RATIO —16:7— so it
    measures itself, without asking anyone, and with a cap so that
    on a wide screen it does not stretch forever. From there comes the
    height of its card, from there the row's, and the donut card stretches
    to match it.

    What cannot happen is the opposite: the chart measuring against
    its card and the card against the chart. That is not a chain, it is
    a circle, and the browser solves it however it can —which is what
    spilled off the page—.

    ── The height ───────────────────────────────────────────────────
    ONE number —420px— and it goes on the grid TRACK, not on the box.

    With `h-[380px]` on the box the track was still `auto`: nobody had
    told it how tall it is. So each card's `h-full` had nothing to
    resolve against, and each one grew with its
    content —the pending list is eight rows, 670px—, the track
    grew with them and the box stayed at 380. The cards
    spilled out the bottom and painted over the transactions table.

    Declaring the TRACK, the height is a given from the start: the
    three cards measure 420, their `h-full` resolves, and whatever does not fit
    scrolls inside its own.

    Each card's `min-h-0` is the other half. A grid
    item has `min-height: auto`, which is its content minimum: without
    setting it to zero, the long list rules over the 420 again and
    we are back where we started.

    ── The width of the two right-hand columns ───────────────────────
    The two are THE SAME: pending payments and distribution are two answers
    of the same size, and one narrower than the other reads as if it
    mattered less. They are written with `repeat(2, …)` so they cannot
    drift apart when someone touches one and forgets the other.

    Never less than 20 % of the row and never more than 30rem —the size
    the distribution already had—, with both ends concrete:
    leaving them `auto` would make them depend on their content, and their
    content depends on them.
  */
  return (
    <div
      className={cn(
        // `auto-rows` and not `grid-rows`: with the chart at full width
        // there are TWO rows, and both measure the same.
        'grid gap-3 sm:gap-5 lg:auto-rows-[420px]',
        /*
          ── The SAME grid as the indicators above ─────────────────────
          Four columns, and each card takes the ones it gets. This
          is not a pretty coincidence: it is the only thing that makes the
          edges of this row land on the ones of the row above, and two
          misaligned rows of cards read as two grids.

          And it is also the right way to say "half". A
          `minmax(50%, …)` measures 50 % of the TOTAL WIDTH, gaps
          included, so the chart came out wider than two
          indicators together: the gaps came out of the other
          two. Taking two columns out of four, the chart measures two
          indicators plus the gap in between, which is exactly
          half the row.

          ── And why the split changes at 1280 ─────────────────────────
          Because at 1024 the math does not work: if the chart takes
          half, the donut and the pending payments get a quarter
          each, and a quarter of 1100px is 275 —less than they
          need—. So there none of them narrows: the chart
          goes full width and the other two drop below, half and
          half. It is the same breakpoint the indicators already use, which
          go two by two up to 1280.
        */
        'lg:grid-cols-2 xl:grid-cols-4',
      )}
    >
      <Behavior hasPending={hasPending}>
        <Trend
          points={data.trend}
          granularity={data.period.granularity === 'day' ? 'dia' : 'mes'}
        />
      </Behavior>

      {hasPending && (
        <PendingPayments
          className="min-h-0"
          payments={data.pending}
          // Opens the «Confirmar pago» sheet: the concept, the expected
          // amount and the due date are already stated here, so
          // what is left is attaching the receipt and confirming.
          onSelect={onSelectPayment}
        />
      )}

      <div className="h-full min-h-0">
        <Distribution
          rows={data.byCategory}
          level={LEVEL_NAME[data.breakdownLevel]}
          parent={data.breakdownParent}
          totalSpent={data.range.expense}
          path={path}
          onDrillDown={onDrillDown}
          onDrillUp={onDrillUp}
        />
      </div>
    </div>
  );
}

function Behavior({ hasPending, children }: { hasPending: boolean; children: ReactNode }) {
  return (
    <Card
      className={cn(
        'h-full min-h-0',
        // With pending payments: the whole row up to 1280, and half from
        // there on. Without them there are two cards, and the donut keeps
        // one column —an indicator's— instead of half the row.
        hasPending ? 'lg:col-span-2' : 'xl:col-span-3',
      )}
    >
      <CardContent className="flex h-full flex-col p-4 sm:p-6">
        <h2 className="mb-4 font-display text-lg font-semibold">
          {t('transactions.dashboard.behaviour')}
        </h2>
        {/*
          `flex-1` with a minimum, not a fixed aspect ratio.

          With an aspect ratio, the chart's height came from its width —and when
          its column narrowed, it suddenly measured less than the cards
          next to it—: they stretched the row, the chart
          kept its small height and showed up stuck to the top with the
          rest of the card blank.

          Now it stretches to the row's height, whoever
          sets it, and the minimum keeps it from flattening when the row
          is short.
        */}
        <div className="min-h-0 flex-1">{children}</div>
      </CardContent>
    </Card>
  );
}

/** The API names the level in English (v2); the screen says it in Spanish. */
const LEVEL_NAME: Record<DashboardBreakdownLevel, string> = {
  cost_center: t('transactions.dashboard.levels.costCenter'),
  category: t('transactions.dashboard.levels.category'),
  concept: 'concepto',
};
