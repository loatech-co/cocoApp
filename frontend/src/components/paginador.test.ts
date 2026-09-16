import { describe, expect, it } from 'vitest';

import { numerosVisibles } from './paginador';

describe('Qué números se ven en el paginador', () => {
  it('con siete páginas o menos, todas', () => {
    expect(numerosVisibles(1, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('siempre están el primero y el último', () => {
    // Son los dos saltos que uno quiere dar; sin ellos hay que pulsar
    // "siguiente" cuarenta veces.
    const nums = numerosVisibles(25, 50);
    expect(nums[0]).toBe(1);
    expect(nums.at(-1)).toBe(50);
  });

  it('la actual va con sus vecinas', () => {
    expect(numerosVisibles(25, 50)).toEqual([1, null, 24, 25, 26, null, 50]);
  });

  it('un salto de UNA página se dibuja como la página, no como puntos', () => {
    // "1 … 3" ocupa lo mismo que "1 2 3" y esconde una página por nada.
    expect(numerosVisibles(3, 20)).toEqual([1, 2, 3, 4, null, 20]);
  });

  it('al principio no deja un salto delante', () => {
    expect(numerosVisibles(1, 20)).toEqual([1, 2, null, 20]);
  });

  it('al final no deja un salto detrás', () => {
    expect(numerosVisibles(20, 20)).toEqual([1, null, 19, 20]);
  });

  it('nunca repite un número', () => {
    for (const p of [1, 2, 3, 10, 19, 20]) {
      const nums = numerosVisibles(p, 20).filter((n): n is number => n !== null);
      expect(new Set(nums).size).toBe(nums.length);
    }
  });
});
