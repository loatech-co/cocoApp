import { describe, expect, it } from 'vitest';

import { indexTree } from '@coco/receipt-parser';

import { recentConcepts } from './recent';

const index = indexTree([
  {
    id: 1,
    name: 'Centro',
    children: [
      {
        id: 10,
        name: 'Cat A',
        children: [
          { id: 100, name: 'Uno' },
          { id: 101, name: 'Dos' },
        ],
      },
      { id: 11, name: 'Cat B', children: [{ id: 110, name: 'Tres' }] },
    ],
  },
]);

describe('Los conceptos recientes', () => {
  it('son los distintos, en orden de aparición, hasta el máximo', () => {
    const transactions = [100, 101, 100, 110, 101, 100].map((categoryId) => ({ categoryId }));
    expect(recentConcepts(transactions, index, 5)).toEqual([100, 101, 110]);
    expect(recentConcepts(transactions, index, 2)).toEqual([100, 101]);
  });

  it('ignora lo sin clasificar y lo que no es un concepto', () => {
    // 10 es una categoría: un movimiento clasificado solo hasta ahí no cuenta
    // como «lo que suelo usar».
    const transactions = [
      { categoryId: null },
      { categoryId: 10 },
      { categoryId: 110 },
      { categoryId: 999 },
    ];
    expect(recentConcepts(transactions, index)).toEqual([110]);
  });

  it('sin movimientos, nada', () => {
    expect(recentConcepts([], index)).toEqual([]);
  });

  it('una respuesta que no es una lista tampoco tumba nada', () => {
    // Los recientes son una comodidad del buscador; un servidor que devuelva
    // otra forma no puede convertir la ficha en una pantalla en blanco.
    expect(recentConcepts(undefined, index)).toEqual([]);
    expect(recentConcepts(null, index)).toEqual([]);
    expect(recentConcepts({ id: 1 } as unknown as [], index)).toEqual([]);
  });
});
