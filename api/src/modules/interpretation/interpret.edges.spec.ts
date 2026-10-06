import type { SearchableNode } from '@coco/receipt-parser';

import { interpret, pesos, summaryOf, type InterpretedClassification } from './interpret';

/** The edges of capture: odd structured values, history that points above a concept. */
const TREE: SearchableNode[] = [
  {
    id: '1',
    name: 'Costos variables',
    children: [
      {
        id: '10',
        name: 'Mercado',
        children: [],
      },
      {
        id: '11',
        name: 'Hogar',
        children: [{ id: '110', name: 'Aseo', keywords: ['detergente'] }],
      },
    ],
  },
];

const context = (history: { categoryId: string; confidence: number } | null = null) => ({
  tree: TREE,
  history,
  today: '2026-10-04',
});

describe('interpretar', () => {
  it('uses a history that points to a category, as a doubt', () => {
    const result = interpret({ merchant: 'Tienda' }, context({ categoryId: '10', confidence: 50 }));
    expect(result.classification).toMatchObject({
      certainty: 'media',
      source: 'historial',
      conceptId: null,
      categoryId: '10',
      name: 'Mercado',
    });
    expect(result.classification.candidates).toHaveLength(1);
  });

  it('ignores a history that points to a cost center', () => {
    const result = interpret({ merchant: 'zzz' }, context({ categoryId: '1', confidence: 95 }));
    expect(result.classification.source).not.toBe('historial');
  });

  it('stops at the category when the dictionary knows the merchant but the tree has no concept', () => {
    const result = interpret({ merchant: 'Carulla' }, context());
    expect(result.classification).toMatchObject({
      certainty: 'media',
      source: 'diccionario',
      conceptId: null,
      categoryId: '10',
      name: 'Mercado',
    });
    expect(result.needsReview).toBe(true);
  });

  it.each([
    [0, null],
    ['', null],
    ['-5', null],
    ['abc', null],
    ['12,5', '12.5'],
    [4500, '4500'],
  ])('reads the structured amount %p as %p', (amount, expected) => {
    expect(interpret({ amount }, context()).amount).toBe(expected);
  });

  it.each(['2026-13-45', '04/10/2026', '2026-10-05', null])(
    'drops the structured date %p',
    (date) => {
      expect(interpret({ date }, context()).date).toBeNull();
    },
  );
});

describe('resumenDe', () => {
  const classification = (overrides: Partial<InterpretedClassification>) => ({
    certainty: 'ninguna' as const,
    source: null,
    conceptId: null,
    categoryId: null,
    name: null,
    candidates: [],
    reason: '',
    ...overrides,
  });

  it('says what is missing when there is no amount', () => {
    expect(summaryOf(null, classification({ certainty: 'alta', name: 'Aseo' }))).toBe(
      'Registrado: sin valor · Aseo',
    );
    expect(summaryOf(null, classification({ certainty: 'media', name: 'Aseo' }))).toBe(
      'Registrado: sin valor · Aseo (por revisar)',
    );
    expect(summaryOf(null, classification({}))).toBe('Pendiente de clasificar');
  });
});

describe('pesos', () => {
  it('writes a non-number as zero pesos', () => {
    expect(pesos('abc')).toBe('$0');
  });
});
