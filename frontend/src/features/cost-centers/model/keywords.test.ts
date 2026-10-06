import { describe, expect, it } from 'vitest';

import { type CategoryTree } from '@/shared/api/categories';
import { classify, SIGNATURES } from '@coco/receipt-parser';

import {
  conceptAlreadyUsing,
  treeSignatures,
  MIN_LENGTH,
  MAX_KEYWORDS,
  splitKeywords,
  rejectionReason,
  includesKeyword,
} from './keywords';

/** A fake concept, with the least the code here looks at. */
function concept(id: number, name: string, keywords: string[] = []): CategoryTree {
  return {
    id,
    name,
    parentId: null,
    kind: 'expense',
    color: null,
    icon: null,
    sortOrder: 0,
    isArchived: false,
    isRecurring: false,
    periodicity: null,
    paymentDay: null,
    paymentMonth: null,
    isStatic: false,
    keywords,
  } as CategoryTree;
}

/** Cost center → category → concept, which is the shape the real tree has. */
function treeWith(...concepts: CategoryTree[]): CategoryTree[] {
  const category = { ...concept(20, 'Servicios públicos'), children: concepts };
  return [{ ...concept(10, 'Costos fijos'), children: [category] }];
}

describe('What is typed, before it is saved', () => {
  it('splits on commas and line breaks, and drops what is empty', () => {
    expect(splitKeywords('Celsia, EPSA\n 805027653 ,, ')).toEqual(['Celsia', 'EPSA', '805027653']);
  });

  it('a repeated word is one even if the accents and the capitals change', () => {
    expect(includesKeyword(['Aquaoccidente'], 'AQUAOCCIDENTE')).toBe(true);
    expect(includesKeyword(['Energía'], 'energia')).toBe(true);
    expect(includesKeyword(['Celsia'], 'EPSA')).toBe(false);
  });

  it('rejects what any receipt would match, what is repeated and what does not fit', () => {
    // Two letters show up INSIDE other words: "ao" is in "pago".
    expect(rejectionReason('ao', [])).toContain(String(MIN_LENGTH));
    expect(rejectionReason('Celsia', ['celsia'])).toContain('ya está');
    expect(rejectionReason('x'.repeat(70), [])).toContain('muy larga');

    const full = Array.from({ length: MAX_KEYWORDS }, (_, i) => `palabra${i}`);
    expect(rejectionReason('Celsia', full)).toContain(String(MAX_KEYWORDS));
  });

  it('lets through what is useful', () => {
    expect(rejectionReason('Comfandi', ['Celsia'])).toBeNull();
    expect(rejectionReason('805027653', [])).toBeNull();
  });
});

describe('A word in two concepts is warned about, not forbidden', () => {
  const tree = treeWith(concept(1, 'Energía', ['Celsia']), concept(2, 'Internet', ['fibra']));

  it('says which other concept already uses it', () => {
    expect(conceptAlreadyUsing(tree, 'celsia')?.name).toBe('Energía');
  });

  it('does not warn about itself', () => {
    expect(conceptAlreadyUsing(tree, 'Celsia', 1)).toBeUndefined();
  });

  it('stays quiet when nobody else uses it', () => {
    expect(conceptAlreadyUsing(tree, 'Comfandi')).toBeUndefined();
  });
});

describe('Keywords classify a receipt', () => {
  /** The way `readReceipt` builds it: what was typed first, the catalog after. */
  const withTree = (tree: CategoryTree[]) => [...treeSignatures(tree), ...SIGNATURES];

  it('a concept without keywords produces no signature', () => {
    expect(treeSignatures(treeWith(concept(1, 'Energía')))).toEqual([]);
  });

  it('recognizes a creditor the catalog does not know', () => {
    const tree = treeWith(concept(1, 'Arriendo oficina', ['Inmobiliaria del Valle']));

    const reading = classify({
      text: 'INMOBILIARIA DEL VALLE S.A.S.\nCanon de arrendamiento\nTotal a pagar $1.200.000',
      source: 'texto-embebido',
      signatures: withTree(tree),
    });

    expect(reading.concept).toBe('Arriendo oficina');
    expect(reading.value).toBe(1_200_000);
  });

  it('also finds it in the file name, which is what is left of a bad scan', () => {
    const tree = treeWith(concept(1, 'Colegio', ['Comfandi']));

    const reading = classify({
      // Recognition got nothing useful out of the paper.
      text: 'recibo de caja  ****  ',
      source: 'ocr',
      fileName: 'comfandi agosto',
      signatures: withTree(tree),
    });

    expect(reading.concept).toBe('Colegio');
  });

  it('what a person typed beats the catalog', () => {
    // The catalog recognizes "celsia" as «Celsia (Energia)». If someone put
    // that same word in THEIR concept, theirs wins.
    const tree = treeWith(concept(1, 'Luz de la casa', ['Celsia']));

    const reading = classify({
      text: 'CELSIA S.A. E.S.P.\nFactura de energía\nTotal a pagar $180.000',
      source: 'texto-embebido',
      signatures: withTree(tree),
    });

    expect(reading.concept).toBe('Luz de la casa');
    // Winning by priority and not by score is a doubt, but it cannot leave the
    // confidence on the floor: the value was read from a total line.
    expect(reading.confidence).toBeGreaterThan(0.4);
  });

  it('without keywords, the catalog still rules', () => {
    const reading = classify({
      text: 'CELSIA S.A. E.S.P.\nFactura de energía\nTotal a pagar $180.000',
      source: 'texto-embebido',
      signatures: withTree(treeWith(concept(1, 'Energía'))),
    });

    expect(reading.concept).toBe('Celsia (Energia)');
  });
});
