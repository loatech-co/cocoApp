import { describe, expect, it } from 'vitest';

import { ALTO_LIENZO, area, curva, equis, etiquetaDeCubo, fechaLarga, linea, ye } from './trend';

/** The y values a cubic Bézier path goes through, sampled finely. */
function sampledYs(d: string): number[] {
  const numbers = (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
  let y0 = numbers[1] ?? 0;
  const ys: number[] = [y0];
  for (let i = 2; i + 5 < numbers.length + 1; i += 6) {
    const [, c1y = 0, , c2y = 0, , y1 = 0] = numbers.slice(i, i + 6);
    for (let t = 0; t <= 1; t += 0.05) {
      const u = 1 - t;
      ys.push(u ** 3 * y0 + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t ** 3 * y1);
    }
    y0 = y1;
  }
  return ys;
}

describe('equis', () => {
  it('centres a single point', () => {
    expect(equis(0, 1)).toBe(50);
  });

  it('spreads the points from edge to edge', () => {
    expect(equis(0, 5)).toBe(0);
    expect(equis(2, 5)).toBe(50);
    expect(equis(4, 5)).toBe(100);
  });
});

describe('ye', () => {
  it('puts zero at the bottom margin and the ceiling at the top margin', () => {
    expect(ye(0, 100)).toBe(ALTO_LIENZO - 3);
    expect(ye(100, 100)).toBe(3);
  });

  it('draws higher values higher on the canvas', () => {
    expect(ye(80, 100)).toBeLessThan(ye(20, 100));
  });
});

describe('curva', () => {
  it('does not overshoot when a steep rise flattens out', () => {
    const d = curva([
      { x: 0, y: 0 },
      { x: 1, y: 10 },
      { x: 2, y: 10.1 },
    ]);

    for (const y of sampledYs(d)) {
      expect(y).toBeLessThanOrEqual(10.1 + 0.01);
      expect(y).toBeGreaterThanOrEqual(-0.01);
    }
  });

  it('draws a flat stretch between two points with the same x', () => {
    const d = curva([
      { x: 0, y: 5 },
      { x: 0, y: 7 },
    ]);

    expect(d).toBe('M 0.00 5.00 C 0.00 5.00, 0.00 7.00, 0.00 7.00');
  });
});

describe('linea', () => {
  it('starts at the first value on the left edge and ends at the last on the right', () => {
    const d = linea([0, 50, 100], 100, 3);

    expect(d.startsWith(`M 0.00 ${ye(0, 100).toFixed(2)}`)).toBe(true);
    expect(d.endsWith(`100.00 ${ye(100, 100).toFixed(2)}`)).toBe(true);
  });
});

describe('area', () => {
  it('closes the line down to the zero baseline', () => {
    const base = ye(0, 100).toFixed(2);
    const d = area([10, 20], 100, 2);

    expect(d.startsWith(linea([10, 20], 100, 2))).toBe(true);
    expect(d.endsWith(`L 100.00 ${base} L 0.00 ${base} Z`)).toBe(true);
  });
});

describe('fechaLarga', () => {
  it('writes a day bucket as a full date', () => {
    expect(fechaLarga('2026-09-06')).toBe('6 de septiembre de 2026');
  });

  it('writes a month bucket as month and year', () => {
    expect(fechaLarga('2026-09')).toBe('Septiembre de 2026');
  });
});

describe('etiquetaDeCubo', () => {
  it('labels a day with its number and short month', () => {
    expect(etiquetaDeCubo('2026-03-05')).toBe('5 mar');
  });

  it('labels a month with a two-digit year', () => {
    expect(etiquetaDeCubo('2025-12')).toBe('dic 25');
  });

  it('drops the year when every bucket is in the same year', () => {
    expect(etiquetaDeCubo('2025-12', true)).toBe('dic');
  });
});
