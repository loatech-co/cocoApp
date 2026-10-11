/**
 * The trend of the dashboard: the movements of the range on a day or month
 * axis, no database needed. `DashboardService.summary` composes it.
 */
import { bucketOf, rangeBuckets, granularityFor } from './dashboard.aggregate';
import type { TrendPoint } from './dashboard.types';
import { ZERO, serialize, toMoney } from '../../common/money/money';
import type { SummaryMovement } from '../transactions/ledger.service';

export function trend(
  movements: readonly SummaryMovement[],
  start: Date,
  end: Date,
): { granularity: 'day' | 'month'; points: TrendPoint[] } {
  const granularity = granularityFor(start, end);
  const buckets = new Map(
    rangeBuckets(start, end, granularity).map((b) => [
      b,
      { expense: ZERO, income: ZERO, count: 0 },
    ]),
  );

  const keys = [...buckets.keys()];
  const firstBucket = keys[0];
  const lastBucket = keys[keys.length - 1];

  for (const m of movements) {
    // Transfers are neither expense nor income: they only change pockets.
    if (m.type === 'transfer') continue;

    // ── Why the bucket date depends on the granularity ────────────────────
    // `period` is the MONTH the expense belongs to, and as a date it is
    // always the 1st. On a month axis that is exactly what is wanted. On a
    // DAY axis, however, every August movement fell on 1 August: the line
    // spiked on the first day and stayed flat for the rest, even though the
    // payments were on the 13th and the 25th.
    const when = granularity === 'day' ? m.date : m.period;

    let bucket = bucketOf(when, granularity);

    if (!buckets.has(bucket)) {
      // The payment fell outside the axis: the March bill paid on 6 April
      // enters the range by its period, but its day does not exist on a
      // March axis. It is moved to the nearest edge instead of being dropped —
      // if it were dropped, the line would add up to less than the total
      // above and the two figures on the same screen would contradict each
      // other.
      // With no axis there is no edge to move it to; below there would be no
      // bucket either.
      if (firstBucket === undefined || lastBucket === undefined) continue;
      bucket = bucketOf(when, granularity) < firstBucket ? firstBucket : lastBucket;
    }

    const current = buckets.get(bucket);
    if (!current) continue;
    const amount = toMoney(m.amount);
    current.count += 1;
    if (m.type === 'expense') current.expense = current.expense.plus(amount);
    else current.income = current.income.plus(amount);
  }

  const points = [...buckets.entries()].map(([bucket, v]) => ({
    bucket,
    expense: serialize(toMoney(v.expense)),
    income: serialize(toMoney(v.income)),
    net: serialize(toMoney(v.income.minus(v.expense))),
    count: v.count,
  }));
  return { granularity, points };
}
