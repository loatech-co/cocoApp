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

describe('Las etiquetas del eje, por día', () => {
  it('marca el 5, 10, 15, 20, 25 y el último del mes', () => {
    const texts = axisLabels(days('2025-03-01', '2025-03-31'), 'dia').map((e) => e.text);
    expect(texts).toEqual(['5 mar', '10', '15', '20', '25', '31']);
  });

  it('el último de abril es 30, no 31', () => {
    const texts = axisLabels(days('2025-04-01', '2025-04-30'), 'dia').map((e) => e.text);
    expect(texts).toEqual(['5 abr', '10', '15', '20', '25', '30']);
  });

  it('en febrero el último es 28, y 29 en bisiesto', () => {
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

  it('el 30 NO se marca cuando el mes tiene 31: quedaría pegado al siguiente', () => {
    const texts = axisLabels(days('2025-03-01', '2025-03-31'), 'dia').map((e) => e.text);
    expect(texts).not.toContain('30');
  });

  it('escribe el nombre del mes solo cuando cambia', () => {
    // Sin esto, dos meses seguidos serían "5 10 15 20 25 31 5 10 15 20 25 30".
    const texts = axisLabels(days('2025-03-20', '2025-04-12'), 'dia').map((e) => e.text);
    expect(texts).toEqual(['20 mar', '25', '31', '5 abr', '10']);
  });

  it('no etiqueta días que no están en el rango', () => {
    const texts = axisLabels(days('2025-03-11', '2025-03-19'), 'dia').map((e) => e.text);
    expect(texts).toEqual(['15 mar']);
  });
});

describe('Las etiquetas del eje, por mes', () => {
  it('dentro de un mismo año: solo el mes, con mayúscula y sin día', () => {
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

  it('cruzando de año, el año va en TODAS o en ninguna', () => {
    // Escribirlo solo donde cambia deja un eje que mezcla "Nov" con "Ene 26"
    // y se lee como si fueran dos cosas distintas.
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

  it('ninguna etiqueta de un eje de meses lleva día', () => {
    const months = Array.from({ length: 30 }, (_, i) => ({
      bucket: `${2024 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`,
    }));
    for (const { text } of axisLabels(months, 'mes')) {
      expect(text).not.toMatch(/^\d/);
    }
  });

  it('con más de doce saltea: no se leen si se tocan', () => {
    const months = Array.from({ length: 36 }, (_, i) => ({
      bucket: `${2023 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`,
    }));
    const labels = axisLabels(months, 'mes');
    expect(labels.length).toBeLessThanOrEqual(12);
    expect(labels[0]!.text).toBe('Ene 2023');
  });
});

/** Evalúa una cúbica de Bézier en t, por eje. */
function bezier(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

/** Los números de un `d`, en orden. */
const numbers = (d: string): number[] => (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);

describe('La curva de la tendencia', () => {
  const inPoints = (ys: number[]): { x: number; y: number }[] =>
    ys.map((y, i) => ({ x: i * 10, y }));

  it('pasa EXACTAMENTE por cada dato', () => {
    // Suavizar no es mover los datos de sitio.
    const d = curve(inPoints([10, 40, 20, 35]));
    const n = numbers(d);
    expect([n[0], n[1]]).toEqual([0, 10]);
    // Cada tramo termina en su punto: los dos últimos números de cada `C`.
    expect([n[6], n[7]]).toEqual([10, 40]);
    expect([n[12], n[13]]).toEqual([20, 20]);
    expect([n[18], n[19]]).toEqual([30, 35]);
  });

  it('NO se pasa de largo: entre dos datos se queda entre sus valores', () => {
    // Una spline normal, entre un mes en cero y otro en un millón, baja por
    // debajo de cero antes de subir. Un gasto negativo que nunca existió no es
    // suavizar, es mentir.
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

  it('un tramo plano se dibuja plano', () => {
    const d = curve(inPoints([50, 50, 50]));
    for (const y of numbers(d).filter((_, i) => i % 2 === 1)) expect(y).toBe(50);
  });

  it('con un solo dato no dibuja tramos', () => {
    expect(curve([{ x: 0, y: 5 }])).toBe('M 0 5');
  });

  it('sin datos, no revienta', () => {
    expect(curve([])).toBe('');
  });
});
