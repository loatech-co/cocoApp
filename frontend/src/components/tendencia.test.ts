import { describe, expect, it } from 'vitest';

import { etiquetasDelEje } from './tendencia';

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
    const textos = etiquetasDelEje(dias('2025-03-01', '2025-03-31'), 'dia', true).map((e) => e.texto);
    expect(textos).toEqual(['5 mar', '10', '15', '20', '25', '31']);
  });

  it('el último de abril es 30, no 31', () => {
    const textos = etiquetasDelEje(dias('2025-04-01', '2025-04-30'), 'dia', true).map((e) => e.texto);
    expect(textos).toEqual(['5 abr', '10', '15', '20', '25', '30']);
  });

  it('en febrero el último es 28, y 29 en bisiesto', () => {
    expect(
      etiquetasDelEje(dias('2025-02-01', '2025-02-28'), 'dia', true).map((e) => e.texto).at(-1),
    ).toBe('28');
    expect(
      etiquetasDelEje(dias('2024-02-01', '2024-02-29'), 'dia', true).map((e) => e.texto).at(-1),
    ).toBe('29');
  });

  it('el 30 NO se marca cuando el mes tiene 31: quedaría pegado al siguiente', () => {
    const textos = etiquetasDelEje(dias('2025-03-01', '2025-03-31'), 'dia', true).map((e) => e.texto);
    expect(textos).not.toContain('30');
  });

  it('escribe el nombre del mes solo cuando cambia', () => {
    // Sin esto, dos meses seguidos serían "5 10 15 20 25 31 5 10 15 20 25 30".
    const textos = etiquetasDelEje(dias('2025-03-20', '2025-04-12'), 'dia', true).map((e) => e.texto);
    expect(textos).toEqual(['20 mar', '25', '31', '5 abr', '10']);
  });

  it('no etiqueta días que no están en el rango', () => {
    const textos = etiquetasDelEje(dias('2025-03-11', '2025-03-19'), 'dia', true).map((e) => e.texto);
    expect(textos).toEqual(['15 mar']);
  });
});

describe('Las etiquetas del eje, por mes', () => {
  it('con doce meses las muestra todas', () => {
    const meses = Array.from({ length: 12 }, (_, i) => ({
      bucket: `2025-${String(i + 1).padStart(2, '0')}`,
    }));
    expect(etiquetasDelEje(meses, 'mes', true)).toHaveLength(12);
  });

  it('con más de doce saltea: no se leen si se tocan', () => {
    const meses = Array.from({ length: 36 }, (_, i) => ({
      bucket: `${2023 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`,
    }));
    const etiquetas = etiquetasDelEje(meses, 'mes', false);
    expect(etiquetas.length).toBeLessThanOrEqual(12);
    expect(etiquetas[0].texto).toBe('ene 23');
  });
});
