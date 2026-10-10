import { describe, expect, it } from 'vitest';

import { classify, conceptSignatures, type SearchableNode } from '@coco/receipt-parser';

/**
 * The dictionary inside the reading of a receipt, and its place in the line.
 *
 * Three things that cannot fail: that it speaks only when nobody else recognized
 * anything, that the person's keywords always beat it, and that what it
 * says carries ids and a certainty —because that is what the sheet needs to
 * propose without guessing—.
 */
const TREE: SearchableNode[] = [
  {
    id: 2,
    name: 'Costos variables',
    children: [
      {
        id: 20,
        name: 'Alimentación',
        children: [
          { id: 200, name: 'Mercado', keywords: [] },
          { id: 201, name: 'Restaurantes', keywords: ['rappi'] },
        ],
      },
      { id: 21, name: 'Transporte', children: [] },
      {
        id: 22,
        name: 'Hogar',
        children: [{ id: 220, name: 'Mercado', keywords: [] }],
      },
    ],
  },
];

/** The signatures that come out of the keywords of THIS tree. */
const ownSignatures = conceptSignatures([
  {
    concept: 'Restaurantes',
    category: 'Alimentación',
    costCenter: 'Costos variables',
    words: ['rappi'],
  },
]);

const read = (text: string, tree: SearchableNode[] = TREE) =>
  classify({ text, source: 'texto-embebido', signatures: ownSignatures, tree });

/** No real tree: the property is not even passed. */
const readWithoutTree = (text: string) =>
  classify({ text, source: 'texto-embebido', signatures: ownSignatures });

describe('The dictionary as the last source of the reading', () => {
  it("recognizes a merchant and takes it to the person's concept: medium certainty here, because there are two «Mercado»", () => {
    // «Mercado» exists twice in this tree —Alimentación and Hogar—, so
    // the dictionary does NOT pick: it leaves both in view.
    const l = read('KOBA COLOMBIA SAS Total 45.000');
    expect(l.inTree?.source).toBe('dictionary');
    expect(l.inTree?.certainty).toBe('medium');
    expect(l.inTree?.conceptId).toBeUndefined();
    expect(l.inTree?.candidates.map((c) => c.id).sort()).toEqual([200, 220]);
    // And each candidate's path is what tells one from the other.
    expect(l.inTree?.candidates.map((c) => c.path).sort()).toEqual([
      'Alimentación › Costos variables',
      'Hogar › Costos variables',
    ]);
  });

  it('with a single destination, high certainty and the concept id', () => {
    const singleMarket: SearchableNode[] = [
      {
        id: 2,
        name: 'Costos variables',
        children: [{ id: 20, name: 'Alimentación', children: [{ id: 200, name: 'Mercado' }] }],
      },
    ];
    const l = read('Compra en ARA cra 5', singleMarket);
    expect(l.inTree).toMatchObject({
      source: 'dictionary',
      certainty: 'high',
      conceptId: 200,
      categoryId: 20,
    });
    expect(l.concept).toBe('Mercado');
    expect(l.category).toBe('Alimentación');
    expect(l.costCenter).toBe('Costos variables');
  });

  it('never goes over the review threshold: it proposes, it does not decide', () => {
    const singleMarket: SearchableNode[] = [
      {
        id: 2,
        name: 'Costos variables',
        children: [{ id: 20, name: 'Alimentación', children: [{ id: 200, name: 'Mercado' }] }],
      },
    ];
    const l = read('EXITO Total a pagar 120.000', singleMarket);
    expect(l.inTree?.certainty).toBe('high');
    expect(l.confidence).toBeLessThan(0.8);
  });

  it('leads to a category with no concepts: medium certainty with the category', () => {
    const l = read('UBER *TRIP 18.500');
    expect(l.inTree).toMatchObject({ source: 'dictionary', certainty: 'medium', categoryId: 21 });
    expect(l.inTree?.conceptId).toBeUndefined();
    expect(l.category).toBe('Transporte');
  });

  it("the person's keywords beat the dictionary", () => {
    // «rappi» is a keyword of «Restaurantes»: that is a signature of their own, and
    // a recognized signature silences the dictionary even if RAPPI is in it.
    const l = read('RAPPI*PEDIDO 32.000');
    expect(l.inTree?.source).toBe('keywords');
    expect(l.inTree?.certainty).toBe('high');
    expect(l.inTree?.conceptId).toBe(201);
    expect(l.concept).toBe('Restaurantes');
  });

  it('an unknown merchant proposes nothing', () => {
    const l = read('FERRETERIA LA ESQUINA 80.000');
    expect(l.inTree).toBeNull();
    expect(l.concept).toBeNull();
  });

  it('without the tree, the dictionary does not speak: there is nowhere to search', () => {
    const l = readWithoutTree('KOBA COLOMBIA SAS');
    expect(l.inTree).toBeNull();
    expect(l.concept).toBeNull();
  });
});
