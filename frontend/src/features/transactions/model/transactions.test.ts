import { describe, expect, it } from 'vitest';

import type { CategoryTree as Category } from '@/shared/api/categories';

import { transactionName, selectedPath, transactionDirection } from './transactions';

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

describe('selectedPath', () => {
  it('rebuilds the whole path from the id of a concept', () => {
    const { costCenter, category, concept } = selectedPath(TREE, 100);

    expect([costCenter?.id, category?.id, concept?.id]).toEqual([1, 10, 100]);
  });

  it('stops at the category or the cost center that was chosen', () => {
    expect(selectedPath(TREE, 11)).toEqual({
      costCenter: TREE[0],
      category: TREE[0]!.children![1],
    });
    expect(selectedPath(TREE, 2)).toEqual({ costCenter: TREE[1] });
  });

  it('returns nothing for no id or an id outside the tree', () => {
    expect(selectedPath(TREE)).toEqual({});
    expect(selectedPath(TREE, 999)).toEqual({});
  });
});

describe('transactionName', () => {
  it('takes the name of its concept over what the paper said', () => {
    expect(transactionName({ ...PAPER, categoryId: 100 }, TREE)).toBe('Aseo');
  });

  it('takes the name of its category when classified only that far', () => {
    expect(transactionName({ ...PAPER, categoryId: 10 }, TREE)).toBe('Aseo y limpieza');
  });

  it('falls back to the description of an unclassified transaction', () => {
    expect(transactionName({ ...PAPER, categoryId: null }, TREE)).toBe('PAGO PSE COMCEL');
  });

  it('falls back to the merchant when there is no description', () => {
    expect(transactionName({ description: null, merchant: 'COMCEL', categoryId: null }, TREE)).toBe(
      'COMCEL',
    );
  });

  it('says it has no concept when nothing else is known', () => {
    expect(transactionName({ description: null, merchant: null, categoryId: null }, TREE)).toBe(
      'Sin concepto',
    );
  });
});

describe('transactionDirection', () => {
  it('maps each transaction type to the direction of the money', () => {
    expect(transactionDirection('income')).toBe('in');
    expect(transactionDirection('expense')).toBe('out');
    expect(transactionDirection('transfer')).toBe('transfer');
  });
});
