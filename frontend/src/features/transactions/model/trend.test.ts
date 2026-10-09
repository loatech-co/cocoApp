import { describe, expect, it } from 'vitest';

import { curve, axisLabels } from './trend';

const days = (from: string, to: string): { bucket: string }[] => {
  const points: { bucket: string }[] = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const fin = new Date(`${to}T00:00:00Z`);
  while (cursor <= fin) {
    points.push({ bucket: cursor.toISOString().slice(0, 10) });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return points;
};

describe('The axis labels, by day', () => {
  it('marks the 5th, 10th, 15th, 20th, 25th and the last of the month', () => {
    const texts = axisLabels(days('2025-03-01', '2025-03-31'), 'dia').map((e) => e.text);
    expect(texts).toEqual(['5 mar', '10', '15', '20', '25', '31']);
  });

  it('the last of April is 30, not 31', () => {
    const texts = axisLabels(days('2025-04-01', '2025-04-30'), 'dia').map((e) => e.text);
    expect(texts).toEqual(['5 abr', '10', '15', '20', '25', '30']);
  });

  it('in February the last is 28, and 29 in a leap year', () => {
    expect(
      axisLabels(days('2025-02-01', '2025-02-28'), 'dia')
        .map((e) => e.text)
        .at(-1),
    ).toBe('28');
    expect(
      axisLabels(days('2024-02-01', '2024-02-29'), 'dia')
        .map((e) => e.text)
        .at(-1),
    ).toBe('29');
  });

  it('the 30th is NOT marked when the month has 31: it would be stuck to the next', () => {
    const texts = axisLabels(days('2025-03-01', '2025-03-31'), 'dia').map((e) => e.text);
    expect(texts).not.toContain('30');
  });

  it('writes the month name only when it changes', () => {
    // Without this, two months in a row would be "5 10 15 20 25 31 5 10 15 20 25 30".
    const texts = axisLabels(days('2025-03-20', '2025-04-12'), 'dia').map((e) => e.text);
    expect(texts).toEqual(['20 mar', '25', '31', '5 abr', '10']);
  });

  it('does not label days that are not in the range', () => {
    const texts = axisLabels(days('2025-03-11', '2025-03-19'), 'dia').map((e) => e.text);
    expect(texts).toEqual(['15 mar']);
  });
});

describe('The axis labels, by month', () => {
  it('within the same year: only the month, capitalized and with no day', () => {
    const months = Array.from({ length: 12 }, (_, i) => ({
      bucket: `2025-${String(i + 1).padStart(2, '0')}`,
    }));
    const texts = axisLabels(months, 'mes').map((e) => e.text);
    expect(texts).toEqual([
      'Ene',
      'Feb',
      'Mar',
      'Abr',
      'May',
      'Jun',
      'Jul',
      'Ago',
      'Sep',
      'Oct',
      'Nov',
      'Dic',
    ]);
  });

  it('crossing a year, the year goes on ALL of them or on none', () => {
    // Writing it only where it changes leaves an axis that mixes "Nov" with "Ene 26"
    // and reads as if they were two different things.
    const months = [
      { bucket: '2025-11' },
      { bucket: '2025-12' },
      { bucket: '2026-01' },
      { bucket: '2026-02' },
    ];
    expect(axisLabels(months, 'mes').map((e) => e.text)).toEqual([
      'Nov 2025',
      'Dic 2025',
      'Ene 2026',
      'Feb 2026',
    ]);
  });

  it('no label of a month axis carries a day', () => {
    const months = Array.from({ length: 30 }, (_, i) => ({
      bucket: `${2024 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`,
    }));
    for (const { text } of axisLabels(months, 'mes')) {
      expect(text).not.toMatch(/^\d/);
    }
  });

  it('with more than twelve it skips: they cannot be read if they touch', () => {
    const months = Array.from({ length: 36 }, (_, i) => ({
      bucket: `${2023 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`,
    }));
    const labels = axisLabels(months, 'mes');
    expect(labels.length).toBeLessThanOrEqual(12);
    expect(labels[0]!.text).toBe('Ene 2023');
  });
});

/** Evaluates a cubic Bézier at t, per axis. */
function bezier(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

/** The numbers of a `d`, in order. */
const numbers = (d: string): number[] => (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);

describe('The trend curve', () => {
  const inPoints = (ys: number[]): { x: number; y: number }[] =>
    ys.map((y, i) => ({ x: i * 10, y }));

  it('goes EXACTLY through each data point', () => {
    // Smoothing is not moving the data around.
    const d = curve(inPoints([10, 40, 20, 35]));
    const n = numbers(d);
    expect([n[0], n[1]]).toEqual([0, 10]);
    // Each segment ends at its point: the last two numbers of each `C`.
    expect([n[6], n[7]]).toEqual([10, 40]);
    expect([n[12], n[13]]).toEqual([20, 20]);
    expect([n[18], n[19]]).toEqual([30, 35]);
  });

  it('does NOT overshoot: between two data points it stays between their values', () => {
    // A normal spline, between a month at zero and another at a million, dips
    // below zero before rising. A negative expense that never existed is not
    // smoothing, it is lying.
    const ys = [0, 0, 100, 0, 0];
    const d = curve(inPoints(ys));
    const n = numbers(d);

    for (let segment = 0; segment < ys.length - 1; segment += 1) {
      const base = 2 + segment * 6;
      const y0 = segment === 0 ? n[1]! : n[base - 1]!;
      const [c1y, c2y, y1] = [n[base + 1]!, n[base + 3]!, n[base + 5]!];

      const min = Math.min(y0, y1);
      const max = Math.max(y0, y1);

      for (let t = 0; t <= 1; t += 0.05) {
        const y = bezier(y0, c1y, c2y, y1, t);
        expect(y).toBeGreaterThanOrEqual(min - 1e-6);
        expect(y).toBeLessThanOrEqual(max + 1e-6);
      }
    }
  });

  it('a flat stretch is drawn flat', () => {
    const d = curve(inPoints([50, 50, 50]));
    for (const y of numbers(d).filter((_, i) => i % 2 === 1)) expect(y).toBe(50);
  });

  it('with a single data point it draws no segments', () => {
    expect(curve([{ x: 0, y: 5 }])).toBe('M 0 5');
  });

  it('with no data, it does not blow up', () => {
    expect(curve([])).toBe('');
  });
});
