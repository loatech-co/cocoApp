import { describe, expect, it } from 'vitest';

import { celdasDelMes, rangoBonito } from './selector-de-rango';

describe('La rejilla del calendario', () => {
  it('empieza en lunes: septiembre de 2026 arranca un martes y deja un hueco', () => {
    const celdas = celdasDelMes(2026, 8);
    // El 1 de septiembre de 2026 es martes: una sola casilla vacía delante.
    expect(celdas.slice(0, 3)).toEqual([null, '2026-09-01', '2026-09-02']);
  });

  it('no pierde ni inventa días: los 30 de septiembre están todos', () => {
    const dias = celdasDelMes(2026, 8).filter((c): c is string => c !== null);
    expect(dias).toHaveLength(30);
    expect(dias.at(-1)).toBe('2026-09-30');
  });

  it('cuando el mes empieza en lunes no deja hueco delante', () => {
    // 1 de junio de 2026, lunes.
    expect(celdasDelMes(2026, 5)[0]).toBe('2026-06-01');
  });

  it('cuando el mes empieza en domingo el hueco es de SEIS casillas', () => {
    // Con la semana en domingo este sería el caso sin hueco; aquí es el mayor.
    // 1 de febrero de 2026, domingo.
    const celdas = celdasDelMes(2026, 1);
    expect(celdas.slice(0, 7)).toEqual([null, null, null, null, null, null, '2026-02-01']);
  });

  it('completa la última fila para que la rejilla sea rectangular', () => {
    // Una fila a medias desalinearía la banda del rango contra el borde.
    expect(celdasDelMes(2026, 8).length % 7).toBe(0);
  });

  it('respeta los años bisiestos', () => {
    const dias = celdasDelMes(2024, 1).filter((c) => c !== null);
    expect(dias).toHaveLength(29);
  });
});

describe('El rango escrito', () => {
  it('escribe el año una sola vez cuando el rango no lo cruza', () => {
    expect(rangoBonito('2026-09-01', '2026-09-10')).toBe('1 sep — 10 sep 2026');
  });

  it('escribe los dos años cuando el rango cruza de uno a otro', () => {
    expect(rangoBonito('2025-12-20', '2026-01-05')).toBe('20 dic 2025 — 5 ene 2026');
  });
});
