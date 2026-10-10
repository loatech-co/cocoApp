import { describe, expect, it } from 'vitest';

import {
  searchInTree,
  indexTree,
  resolveTerms,
  readablePath,
  type SearchableNode,
} from '@coco/receipt-parser';

/**
 * The search over someone's tree.
 *
 * It lives in `@coco/receipt-parser` and is tested from here like the rest of the package:
 * it is what the sheet uses to find a concept in two letters, and what
 * the dictionary uses to translate «d1» into whatever that person calls the market.
 */
const TREE: SearchableNode[] = [
  {
    id: 1,
    name: 'Costos fijos',
    children: [
      {
        id: 10,
        name: 'Servicios públicos',
        children: [
          { id: 100, name: 'Celsia (Energía)', keywords: ['celsia', 'epsa'] },
          { id: 101, name: 'Aquaoccidente (Agua)', keywords: ['acueducto'] },
        ],
      },
      {
        id: 11,
        name: 'Educación',
        children: [{ id: 110, name: 'Colegio Tuti' }],
      },
    ],
  },
  {
    id: 2,
    name: 'Costos variables',
    children: [
      {
        id: 20,
        name: 'Alimentación',
        children: [
          { id: 200, name: 'Mercado', keywords: ['D1', 'Koba Colombia', 'Ara'] },
          { id: 201, name: 'Supermercado' },
        ],
      },
      { id: 21, name: 'Transporte', children: [] },
    ],
  },
];

const index = indexTree(TREE);

describe('Indexing the tree', () => {
  it('flattens the three levels with their path', () => {
    const market = index.find((e) => e.id === 200)!;
    expect(market.level).toBe('concepto');
    expect(market.path).toEqual(['Alimentación', 'Costos variables']);
    expect(market.categoryId).toBe(20);
    expect(market.costCenterId).toBe(2);
    expect(readablePath(market)).toBe('Alimentación › Costos variables');
  });

  it('a category only carries its center in the path', () => {
    const food = index.find((e) => e.id === 20)!;
    expect(food.level).toBe('categoria');
    expect(food.path).toEqual(['Costos variables']);
  });
});

describe('Search', () => {
  it('finds by name, regardless of accents or capitals', () => {
    expect(searchInTree(index, 'educacion').map((e) => e.name)).toEqual(['Educación']);
    expect(searchInTree(index, 'CELSIA').map((e) => e.id)).toEqual([100]);
  });

  it('finds by keyword: «d1» is Mercado', () => {
    // It is the reason it exists: what the receipt says is not the name of the
    // concept, it is what someone wrote as a keyword.
    expect(searchInTree(index, 'd1').map((e) => e.id)).toEqual([200]);
    expect(searchInTree(index, 'koba').map((e) => e.id)).toEqual([200]);
  });

  it('the exact name beats the one that starts the same, and that one beats the one that contains it', () => {
    const names = searchInTree(index, 'mercado').map((e) => e.name);
    expect(names).toEqual(['Mercado', 'Supermercado']);
  });

  it('at equal likeness, the concept before the category', () => {
    // «Transporte» is a category; if there were an equal concept, it would go first.
    const withConcept = indexTree([
      {
        id: 3,
        name: 'Centro',
        children: [{ id: 30, name: 'Transporte', children: [{ id: 300, name: 'Transporte' }] }],
      },
    ]);
    expect(searchInTree(withConcept, 'transporte').map((e) => e.level)).toEqual([
      'concepto',
      'categoria',
    ]);
  });

  it('with several words, all of them have to be found', () => {
    // «mercado d1» cannot bring Supermercado just because it says «mercado».
    expect(searchInTree(index, 'mercado d1').map((e) => e.id)).toEqual([200]);
    expect(searchInTree(index, 'mercado zzz')).toEqual([]);
  });

  it('empty returns empty: the recent ones are set by the caller', () => {
    expect(searchInTree(index, '')).toEqual([]);
    expect(searchInTree(index, '   ')).toEqual([]);
  });

  it('does not return cost centers: picking one classifies nothing', () => {
    expect(searchInTree(index, 'costos')).toEqual([]);
    expect(searchInTree(index, 'costos', { levels: ['centro'] }).map((e) => e.name)).toEqual([
      'Costos fijos',
      'Costos variables',
    ]);
  });
});

describe('Resolving generic terms (what the dictionary uses)', () => {
  it('HIGH when the terms lead to a single concept', () => {
    const r = resolveTerms(index, ['acueducto', 'agua']);
    expect(r.certainty).toBe('high');
    expect(r.concept?.id).toBe(101);
  });

  it('MEDIUM when they lead to several concepts: it proposes their common category', () => {
    // «mercado» and «supermercado» are two concepts of the same account. Picking
    // one would be moving money to a place nobody asked for.
    const r = resolveTerms(index, ['mercado', 'supermercado']);
    expect(r.certainty).toBe('medium');
    expect(r.concept).toBeUndefined();
    expect(r.category?.id).toBe(20);
    expect(r.candidates.map((c) => c.id).sort()).toEqual([200, 201]);
  });

  it('MEDIUM when they lead to a category and to no concept', () => {
    // Whoever has «Transporte» as an empty category: the category is proposed.
    const r = resolveTerms(index, ['transporte', 'taxi']);
    expect(r.certainty).toBe('medium');
    expect(r.category?.id).toBe(21);
    expect(r.candidates.map((c) => c.id)).toEqual([21]);
  });

  it('MEDIUM with several concepts from different categories: it proposes none', () => {
    const r = resolveTerms(index, ['celsia', 'mercado']);
    expect(r.certainty).toBe('medium');
    expect(r.category).toBeUndefined();
    expect(r.candidates.length).toBeGreaterThan(1);
  });

  it('NONE when they lead to nothing', () => {
    const r = resolveTerms(index, ['gasolina', 'combustible']);
    expect(r.certainty).toBe('none');
    expect(r.candidates).toEqual([]);
  });
});
