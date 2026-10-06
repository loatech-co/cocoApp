import { describe, expect, it } from 'vitest';

import type { CategoryTree as Category } from '@/shared/api/categories';

import { nombreDelMovimiento, rutaSeleccionada, sentidoDelMovimiento } from './movimientos';

const leaf = (id: number, name: string, children?: Category[]): Category =>
  ({ id, name, ...(children ? { children } : {}) }) as Category;

const TREE: Category[] = [
  leaf(1, 'Costos fijos', [
    leaf(10, 'Aseo y limpieza', [leaf(100, 'Aseo')]),
    leaf(11, 'Servicios públicos'),
  ]),
  leaf(2, 'Ingresos'),
];

const PAPER = { description: 'PAGO PSE COMCEL', merchant: 'COMCEL' };

describe('rutaSeleccionada', () => {
  it('rebuilds the whole path from the id of a concept', () => {
    const { centro, categoria, concepto } = rutaSeleccionada(TREE, 100);

    expect([centro?.id, categoria?.id, concepto?.id]).toEqual([1, 10, 100]);
  });

  it('stops at the category or the cost center that was chosen', () => {
    expect(rutaSeleccionada(TREE, 11)).toEqual({
      centro: TREE[0],
      categoria: TREE[0]!.children![1],
    });
    expect(rutaSeleccionada(TREE, 2)).toEqual({ centro: TREE[1] });
  });

  it('returns nothing for no id or an id outside the tree', () => {
    expect(rutaSeleccionada(TREE)).toEqual({});
    expect(rutaSeleccionada(TREE, 999)).toEqual({});
  });
});

describe('nombreDelMovimiento', () => {
  it('takes the name of its concept over what the paper said', () => {
    expect(nombreDelMovimiento({ ...PAPER, categoryId: 100 }, TREE)).toBe('Aseo');
  });

  it('takes the name of its category when classified only that far', () => {
    expect(nombreDelMovimiento({ ...PAPER, categoryId: 10 }, TREE)).toBe('Aseo y limpieza');
  });

  it('falls back to the description of an unclassified movement', () => {
    expect(nombreDelMovimiento({ ...PAPER, categoryId: null }, TREE)).toBe('PAGO PSE COMCEL');
  });

  it('falls back to the merchant when there is no description', () => {
    expect(
      nombreDelMovimiento({ description: null, merchant: 'COMCEL', categoryId: null }, TREE),
    ).toBe('COMCEL');
  });

  it('says it has no concept when nothing else is known', () => {
    expect(nombreDelMovimiento({ description: null, merchant: null, categoryId: null }, TREE)).toBe(
      'Sin concepto',
    );
  });
});

describe('sentidoDelMovimiento', () => {
  it('maps each movement type to the direction of the money', () => {
    expect(sentidoDelMovimiento('income')).toBe('entra');
    expect(sentidoDelMovimiento('expense')).toBe('sale');
    expect(sentidoDelMovimiento('transfer')).toBe('mueve');
  });
});
