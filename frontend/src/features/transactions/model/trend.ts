import { longDay, SHORT_MONTHS, longMonth } from '@/shared/lib/format';
import { t } from '@/shared/lib/i18n';

/*
  The geometry and the axis of the trend chart: what is computed without drawing.
*/

/** The unit a trend is grouped by, as a person reads it: `día` or `mes`. */
export function unit(granularity: 'dia' | 'mes'): string {
  return granularity === 'dia'
    ? t('transactions.trend.units.day')
    : t('transactions.trend.units.month');
}

/** X coordinate of a point on the 0–100 canvas. */
export function xAt(i: number, total: number): number {
  return total === 1 ? 50 : (i / (total - 1)) * 100;
}

/**
 * Y coordinate: it is inverted because in SVG 0 is at the top.
 *
 * ── Why there is a margin at the top and bottom ─────────────────────────────
 * Because the highest point of the series is worth exactly the ceiling, and with no margin it fell
 * at y=0: half the stroke width was left outside the canvas and the SVG
 * clipped it. The line appeared cut flush right at its peak, which is the fact
 * you were looking at. Same at the bottom with the zeros.
 */
export const CANVAS_HEIGHT = 42;
const MARGIN_Y = 3;

export function yAt(value: number, ceiling: number): number {
  const usable = CANVAS_HEIGHT - MARGIN_Y * 2;
  return CANVAS_HEIGHT - MARGIN_Y - (value / ceiling) * usable;
}

/**
 * The line, in curves.
 *
 * ── Why a curve and not straight segments ───────────────────────────────────
 * Because the series is a SAMPLING of something continuous: spending does not jump from one
 * value to another the instant the day changes, it comes and goes. Straight segments
 * with their pointed peaks suggest a precision the data does not have.
 *
 * ── Why MONOTONE and not just any curve ─────────────────────────────────────
 * A normal spline overshoots when it bends: between a month of zero and one of
 * a million, the curve dips below zero before rising. Drawing a negative
 * expense that never existed is not smoothing, it is lying. This variant
 * —Fritsch–Carlson— adjusts the slopes so the curve never leaves the
 * range of the two points it joins: if the data rises, the curve rises; if the data
 * does not go below zero, neither does the curve.
 */
export function curve(points: { x: number; y: number }[]): string {
  const [first] = points;
  if (first === undefined) return '';
  if (points.length === 1) return `M ${first.x} ${first.y}`;

  const n = points.length;
  // All the indices below go from 0 to n - 1: the fallbacks are never used.
  const point = (i: number): { x: number; y: number } => points[i] ?? first;
  const value = (list: readonly number[], i: number): number => list[i] ?? 0;

  // Slope of each segment.
  const deltas: number[] = [];
  for (let i = 0; i < n - 1; i += 1) {
    const dx = point(i + 1).x - point(i).x;
    deltas.push(dx === 0 ? 0 : (point(i + 1).y - point(i).y) / dx);
  }

  // Tangent at each point: the average of the slopes arriving at it.
  const tangentes: number[] = [value(deltas, 0)];
  for (let i = 1; i < n - 1; i += 1) {
    tangentes.push((value(deltas, i - 1) + value(deltas, i)) / 2);
  }
  tangentes.push(value(deltas, n - 2));

  // And here is what prevents the overshoot. Where the segment is flat, the curve
  // arrives and leaves flat; where it is not, the tangents are clamped to the circle of
  // radius 3, which is the Fritsch–Carlson condition.
  for (let i = 0; i < n - 1; i += 1) {
    const delta = value(deltas, i);
    if (delta === 0) {
      tangentes[i] = 0;
      tangentes[i + 1] = 0;
      continue;
    }

    const a = value(tangentes, i) / delta;
    const b = value(tangentes, i + 1) / delta;
    const s = a * a + b * b;

    if (s > 9) {
      const factor = 3 / Math.sqrt(s);
      tangentes[i] = factor * a * delta;
      tangentes[i + 1] = factor * b * delta;
    }
  }

  let d = `M ${first.x.toFixed(2)} ${first.y.toFixed(2)}`;
  for (let i = 0; i < n - 1; i += 1) {
    const from = point(i);
    const to = point(i + 1);
    const h = (to.x - from.x) / 3;
    const c1 = { x: from.x + h, y: from.y + value(tangentes, i) * h };
    const c2 = { x: to.x - h, y: to.y - value(tangentes, i + 1) * h };
    d +=
      ` C ${c1.x.toFixed(2)} ${c1.y.toFixed(2)},` +
      ` ${c2.x.toFixed(2)} ${c2.y.toFixed(2)},` +
      ` ${to.x.toFixed(2)} ${to.y.toFixed(2)}`;
  }

  return d;
}

/** The series in canvas coordinates. */
function toPoints(series: number[], ceiling: number, total: number): { x: number; y: number }[] {
  return series.map((v, i) => ({ x: xAt(i, total), y: yAt(v, ceiling) }));
}

export function line(series: number[], ceiling: number, total: number): string {
  return curve(toPoints(series, ceiling, total));
}

/** The same line, closed against the baseline, for the fill. */
export function area(series: number[], ceiling: number, total: number): string {
  // It closes on the ZERO line, not on the canvas edge: closing at the very
  // bottom, the fill spread below where zero is.
  const base = yAt(0, ceiling).toFixed(2);
  return `${line(series, ceiling, total)} L ${xAt(total - 1, total).toFixed(2)} ${base} L ${xAt(0, total).toFixed(2)} ${base} Z`;
}

/**
 * The full date of a point: `6 de septiembre de 2026` or `Septiembre de
 * 2026`.
 *
 * Here it does fit and here it is needed. On the axis there are dozens of dates and the
 * full name would make them collide; on the card there is ONE, and "sep 26" forces
 * deciphering an abbreviation and guessing whether 26 is the day or the year.
 */
export function longDate(bucket: string): string {
  return bucket.length > 7 ? longDay(bucket) : longMonth(bucket);
}

/** The last day of a month: 28, 29, 30 or 31 depending on which. */
function lastDay(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Which axis points get a label, and what each one says.
 *
 * ── Less than three months: every five days ─────────────────────────────────
 * 5, 10, 15, 20, 25 and the last of the month —28, 29, 30 or 31, depending on which—. The
 * 30 only appears when it really closes the month: in a 31-day month it would be
 * a label stuck to the next one.
 *
 * There is no talk of "weeks" because weeks do not line up with months: the
 * 5th week starts on a Tuesday in March and on a Friday in April, and comparing two
 * months would stop being possible.
 *
 * The MONTH NAME is written only the first time it appears. Without it, a
 * two-month range shows "5 10 15 20 25 31 5 10 15 20 25 30" and there is no
 * way to know where one ends and the other begins.
 *
 * ── Three months or more: only the month ────────────────────────────────────
 * "Ene Feb Mar", no day. All with the same shape: if the range crosses a year
 * they all carry it —in full, "Abr 2023"— and if it does not cross, none do. Writing it only where
 * it changes left an axis that mixed "ene" with "abr 23" and read as if
 * they were two different things.
 *
 * And if there are so many months that they do not fit, one out of every so many. Fifty labels
 * on a phone cannot be read: they touch.
 */
export function axisLabels(
  points: readonly { bucket: string }[],
  granularity: 'dia' | 'mes',
): { index: number; text: string }[] {
  if (granularity === 'mes') {
    const every = Math.max(1, Math.ceil(points.length / 12));

    // All the labels with the SAME shape. Writing the year only where
    // it changes leaves an axis that mixes "ene" with "abr 23" and reads as if
    // they were two different things. If the range crosses a year, the year goes on
    // all of them; if it does not, on none.
    const isMultiYear = new Set(points.map((p) => p.bucket.slice(0, 4))).size > 1;

    return points
      .map((p, index) => ({ index, bucket: p.bucket }))
      .filter(({ index }) => index % every === 0)
      .map(({ index, bucket }) => {
        const [year, month = ''] = bucket.split('-');
        const name = SHORT_MONTHS[Number(month) - 1] ?? month;
        const capitalized = name.charAt(0).toUpperCase() + name.slice(1);
        // The FULL year, not its last two digits. "Abr 23" forces
        // completing it mentally, and in a history that starts in 2022 that
        // is exactly what has to be read effortlessly.
        return { index, text: isMultiYear ? `${capitalized} ${year}` : capitalized };
      });
  }

  const labels: { index: number; text: string }[] = [];
  let monthName = '';

  points.forEach((p, index) => {
    // A daily bucket always brings its three parts: the fallbacks are not used.
    const [year = NaN, month = NaN, day = NaN] = p.bucket.split('-').map(Number);
    const isLast = day === lastDay(year, month);
    // 5, 10, 15, 20 and 25. The 30 is left out: either it closes the month —and comes in through the
    // other condition— or it is one day away from the 31st, which does close it.
    const isFifth = day % 5 === 0 && day < 26;
    if (!isFifth && !isLast) return;

    const key = p.bucket.slice(0, 7);
    const text = key === monthName ? String(day) : `${day} ${SHORT_MONTHS[month - 1] ?? month}`;
    monthName = key;

    labels.push({ index, text });
  });

  return labels;
}

/**
 * `2025-03-14` → `14 mar`. `2025-03` → `mar 25`, or just `mar` if the whole range
 * falls in the same year.
 *
 * Repeating the year on the twelve points of the same year is noise: it takes space,
 * makes the labels step on each other and does not tell one point from another. It only helps
 * when the range crosses a year.
 */
export function bucketLabel(bucket: string, isSameYear = false): string {
  const [year = '', month = '', day] = bucket.split('-');
  const name = SHORT_MONTHS[Number(month) - 1] ?? month;
  if (day) return `${Number(day)} ${name}`;
  return isSameYear ? name : `${name} ${year.slice(2)}`;
}
