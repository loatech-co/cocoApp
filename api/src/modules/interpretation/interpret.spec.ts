import type { SearchableNode } from '@coco/receipt-parser';

import { SAFE_HISTORY_CONFIDENCE, interpret, pesos, summaryOf } from './interpret';

/**
 * The brain, on its own: from a text to an interpreted expense, with the
 * plan's precedence and without guessing.
 */
const TREE: SearchableNode[] = [
  {
    id: '2',
    name: 'Costos variables',
    children: [
      {
        id: '20',
        name: 'Alimentación',
        children: [
          { id: '200', name: 'Mercado', keywords: [] },
          { id: '201', name: 'Restaurantes', keywords: ['rappi'] },
        ],
      },
      { id: '21', name: 'Transporte', children: [] },
    ],
  },
];

const context = (history: { categoryId: string; confidence: number } | null = null) => ({
  tree: TREE,
  history,
  today: '2026-10-04',
});

describe('Interpreting a text', () => {
  it('a bank SMS: gets the amount, the date and classifies by the dictionary', () => {
    const r = interpret(
      { text: 'Compra por $45.000 en KOBA COLOMBIA el 03/10/2026 con tu tarjeta *1234' },
      context(),
    );
    expect(r.amount).toBe('45000');
    expect(r.date).toBe('2026-10-03');
    expect(r.classification).toMatchObject({
      certainty: 'alta',
      source: 'diccionario',
      conceptId: '200',
      categoryId: '20',
      name: 'Mercado',
    });
    expect(r.needsReview).toBe(false);
  });

  it("the person's keywords beat the dictionary", () => {
    const r = interpret({ text: 'RAPPI*PEDIDO 32.000' }, context());
    expect(r.classification).toMatchObject({
      source: 'palabras-clave',
      certainty: 'alta',
      conceptId: '201',
    });
  });

  it('and the history beats everything else', () => {
    // The text says KOBA (groceries), but the history says this goes to
    // Restaurantes 100% of the time: the history wins.
    const r = interpret(
      { text: 'KOBA COLOMBIA 45.000' },
      context({ categoryId: '201', confidence: 100 }),
    );
    expect(r.classification).toMatchObject({
      source: 'historial',
      certainty: 'alta',
      conceptId: '201',
    });
  });

  it('a split history is MEDIUM certainty: it proposes, but for review', () => {
    const r = interpret(
      { text: 'KOBA COLOMBIA 45.000' },
      context({ categoryId: '201', confidence: SAFE_HISTORY_CONFIDENCE - 1 }),
    );
    expect(r.classification.certainty).toBe('media');
    expect(r.classification.source).toBe('historial');
    expect(r.needsReview).toBe(true);
  });

  it('a merchant that leads to a category without concepts: MEDIUM with the category', () => {
    const r = interpret({ text: 'UBER *TRIP 18.500' }, context());
    expect(r.classification).toMatchObject({
      certainty: 'media',
      source: 'diccionario',
      conceptId: null,
      categoryId: '21',
      name: 'Transporte',
    });
    expect(r.needsReview).toBe(true);
  });

  it('an unknown merchant: NONE, and for review', () => {
    const r = interpret({ text: 'FERRETERIA LA ESQUINA 80.000' }, context());
    expect(r.classification.certainty).toBe('ninguna');
    expect(r.classification.conceptId).toBeNull();
    expect(r.needsReview).toBe(true);
  });

  it('without an amount or a date, for review even when the classification is high', () => {
    const r = interpret({ text: 'KOBA COLOMBIA' }, context());
    expect(r.classification.certainty).toBe('alta');
    expect(r.amount).toBeNull();
    expect(r.needsReview).toBe(true);
  });
});

describe('Interpreting structured data (Wallet)', () => {
  it('structured data wins: amount and date are given, the merchant classifies', () => {
    const r = interpret(
      { merchant: 'Exito Poblado', amount: 120000, date: '2026-10-02' },
      context(),
    );
    expect(r.amount).toBe('120000');
    expect(r.date).toBe('2026-10-02');
    expect(r.merchant).toBe('Exito Poblado');
    expect(r.classification).toMatchObject({ certainty: 'alta', conceptId: '200' });
    expect(r.needsReview).toBe(false);
  });

  it('Wallet sometimes arrives without an amount: interpreted anyway, and for review', () => {
    const r = interpret({ merchant: 'Exito Poblado', date: '2026-10-02' }, context());
    expect(r.amount).toBeNull();
    expect(r.needsReview).toBe(true);
  });

  it('a future or broken date is not accepted', () => {
    expect(
      interpret({ merchant: 'Exito', amount: 1, date: '2027-01-01' }, context()).date,
    ).toBeNull();
    expect(interpret({ merchant: 'Exito', amount: 1, date: 'ayer' }, context()).date).toBeNull();
  });
});

describe('The summary for the notification', () => {
  const high = {
    certainty: 'alta' as const,
    source: 'diccionario' as const,
    conceptId: '200',
    categoryId: '20',
    name: 'Mercado',
    candidates: [],
    reason: '',
  };

  it('three words: what, how much, where', () => {
    expect(summaryOf('45000', high)).toBe('Registrado: $45.000 · Mercado');
  });

  it('with medium certainty it says so', () => {
    expect(summaryOf('18500', { ...high, certainty: 'media', name: 'Transporte' })).toBe(
      'Registrado: $18.500 · Transporte (por revisar)',
    );
  });

  it('without a classification, pending', () => {
    expect(summaryOf('80000', { ...high, certainty: 'ninguna', name: null })).toBe(
      'Registrado: $80.000 · Pendiente de clasificar',
    );
    expect(summaryOf(null, { ...high, certainty: 'ninguna', name: null })).toBe(
      'Pendiente de clasificar',
    );
  });

  it('money is written the local way', () => {
    expect(pesos('1200000')).toBe('$1.200.000');
    expect(pesos(45000.5)).toBe('$45.001');
  });
});
