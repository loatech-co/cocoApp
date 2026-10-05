import { describe, expect, it } from 'vitest';

import { curva, etiquetasDelEje } from './tendencia';

const dias = (desde: string, hasta: string): { bucket: string }[] => {
  const puntos: { bucket: string }[] = [];
  const cursor = new Date(`${desde}T00:00:00Z`);
  const fin = new Date(`${hasta}T00:00:00Z`);
  while (cursor <= fin) {
    puntos.push({ bucket: cursor.toISOString().slice(0, 10) });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return puntos;
};

describe('Las etiquetas del eje, por día', () => {
  it('marca el 5, 10, 15, 20, 25 y el último del mes', () => {
    const textos = etiquetasDelEje(dias('2025-03-01', '2025-03-31'), 'dia').map((e) => e.texto);
    expect(textos).toEqual(['5 mar', '10', '15', '20', '25', '31']);
  });

  it('el último de abril es 30, no 31', () => {
    const textos = etiquetasDelEje(dias('2025-04-01', '2025-04-30'), 'dia').map((e) => e.texto);
    expect(textos).toEqual(['5 abr', '10', '15', '20', '25', '30']);
  });

  it('en febrero el último es 28, y 29 en bisiesto', () => {
    expect(
      etiquetasDelEje(dias('2025-02-01', '2025-02-28'), 'dia')
        .map((e) => e.texto)
        .at(-1),
    ).toBe('28');
    expect(
      etiquetasDelEje(dias('2024-02-01', '2024-02-29'), 'dia')
        .map((e) => e.texto)
        .at(-1),
    ).toBe('29');
  });

  it('el 30 NO se marca cuando el mes tiene 31: quedaría pegado al siguiente', () => {
    const textos = etiquetasDelEje(dias('2025-03-01', '2025-03-31'), 'dia').map((e) => e.texto);
    expect(textos).not.toContain('30');
  });

  it('escribe el nombre del mes solo cuando cambia', () => {
    // Sin esto, dos meses seguidos serían "5 10 15 20 25 31 5 10 15 20 25 30".
    const textos = etiquetasDelEje(dias('2025-03-20', '2025-04-12'), 'dia').map((e) => e.texto);
    expect(textos).toEqual(['20 mar', '25', '31', '5 abr', '10']);
  });

  it('no etiqueta días que no están en el rango', () => {
    const textos = etiquetasDelEje(dias('2025-03-11', '2025-03-19'), 'dia').map((e) => e.texto);
    expect(textos).toEqual(['15 mar']);
  });
});

describe('Las etiquetas del eje, por mes', () => {
  it('dentro de un mismo año: solo el mes, con mayúscula y sin día', () => {
    const meses = Array.from({ length: 12 }, (_, i) => ({
      bucket: `2025-${String(i + 1).padStart(2, '0')}`,
    }));
    const textos = etiquetasDelEje(meses, 'mes').map((e) => e.texto);
    expect(textos).toEqual([
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
    const meses = [
      { bucket: '2025-11' },
      { bucket: '2025-12' },
      { bucket: '2026-01' },
      { bucket: '2026-02' },
    ];
    expect(etiquetasDelEje(meses, 'mes').map((e) => e.texto)).toEqual([
      'Nov 2025',
      'Dic 2025',
      'Ene 2026',
      'Feb 2026',
    ]);
  });

  it('ninguna etiqueta de un eje de meses lleva día', () => {
    const meses = Array.from({ length: 30 }, (_, i) => ({
      bucket: `${2024 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`,
    }));
    for (const { texto } of etiquetasDelEje(meses, 'mes')) {
      expect(texto).not.toMatch(/^\d/);
    }
  });

  it('con más de doce saltea: no se leen si se tocan', () => {
    const meses = Array.from({ length: 36 }, (_, i) => ({
      bucket: `${2023 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`,
    }));
    const etiquetas = etiquetasDelEje(meses, 'mes');
    expect(etiquetas.length).toBeLessThanOrEqual(12);
    expect(etiquetas[0]!.texto).toBe('Ene 2023');
  });
});

/** Evalúa una cúbica de Bézier en t, por eje. */
function bezier(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

/** Los números de un `d`, en orden. */
const numeros = (d: string): number[] => (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);

describe('La curva de la tendencia', () => {
  const enPuntos = (ys: number[]): { x: number; y: number }[] =>
    ys.map((y, i) => ({ x: i * 10, y }));

  it('pasa EXACTAMENTE por cada dato', () => {
    // Suavizar no es mover los datos de sitio.
    const d = curva(enPuntos([10, 40, 20, 35]));
    const n = numeros(d);
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
    const d = curva(enPuntos(ys));
    const n = numeros(d);

    for (let tramo = 0; tramo < ys.length - 1; tramo += 1) {
      const base = 2 + tramo * 6;
      const y0 = tramo === 0 ? n[1]! : n[base - 1]!;
      const [c1y, c2y, y1] = [n[base + 1]!, n[base + 3]!, n[base + 5]!];

      const minimo = Math.min(y0, y1);
      const maximo = Math.max(y0, y1);

      for (let t = 0; t <= 1; t += 0.05) {
        const y = bezier(y0, c1y, c2y, y1, t);
        expect(y).toBeGreaterThanOrEqual(minimo - 1e-6);
        expect(y).toBeLessThanOrEqual(maximo + 1e-6);
      }
    }
  });

  it('un tramo plano se dibuja plano', () => {
    const d = curva(enPuntos([50, 50, 50]));
    for (const y of numeros(d).filter((_, i) => i % 2 === 1)) expect(y).toBe(50);
  });

  it('con un solo dato no dibuja tramos', () => {
    expect(curva([{ x: 0, y: 5 }])).toBe('M 0 5');
  });

  it('sin datos, no revienta', () => {
    expect(curva([])).toBe('');
  });
});
