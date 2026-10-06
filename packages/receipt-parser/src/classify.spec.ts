import { classify, needsReview, REVIEW_THRESHOLD, type Reading } from './classify';
import { conceptSignatures, treeSignatures, type Signature } from './signatures';
import { makeConceptWithWords, makeTree } from './testing/factories';

/** A catalogue signature, owned by the test so the shipped catalogue can change freely. */
function makeSignature(overrides: Partial<Signature> = {}): Signature {
  return {
    concept: 'Energía',
    category: 'Servicios públicos',
    costCenter: 'Hogar',
    alias: ['enel'],
    ...overrides,
  };
}

describe('clasificar', () => {
  it('recognises the creditor by NIT, alias and file name, and explains it', () => {
    const reading = classify({
      text: 'ENEL Colombia NIT 860.063.875-8\nPagado en Bancolombia\nTotal a pagar $ 152.300',
      source: 'texto-embebido',
      fileName: 'FACT-enel-marzo.pdf',
      period: '2026-03',
      signatures: [
        makeSignature({
          nits: ['8600638758'],
          nameTokens: ['enel'],
          namePrefixes: ['fact'],
          range: { min: 50_000, max: 500_000 },
        }),
      ],
    });

    expect(reading).toMatchObject({ concept: 'Energía', value: 152300, date: '2026-03-15' });
    expect(reading.signals).toEqual({
      text: ['enel'],
      name: ['enel', 'FACT'],
      nit: ['8600638758'],
      ignoredCollectors: ['bancolombia'],
    });
    expect(reading.reason).toBe(
      'Energía por NIT 8600638758 + “enel” en el texto + “enel”, “FACT” en el nombre ' +
        '(texto-embebido). Ignoré bancolombia por ser recaudador.',
    );
    expect(reading.inTree).toBeNull();
  });

  it('lowers confidence for OCR, a close runner-up and a value out of range', () => {
    const base = {
      text: 'enel\nTotal 152.300',
      signatures: [makeSignature()],
    };
    const clean = classify({ ...base, source: 'texto-embebido' });
    const ocr = classify({ ...base, source: 'ocr' });
    const tied = classify({
      ...base,
      source: 'texto-embebido',
      signatures: [makeSignature(), makeSignature({ concept: 'Otra' })],
    });
    const outOfRange = classify({
      ...base,
      source: 'texto-embebido',
      signatures: [makeSignature({ range: { min: 1, max: 10 } })],
    });

    expect(ocr.confidence).toBeLessThan(clean.confidence);
    expect(tied.confidence).toBeLessThan(clean.confidence);
    expect(tied.alternatives).toEqual([{ concept: 'Otra', score: 30 }]);
    expect(outOfRange.confidence).toBeLessThan(clean.confidence);
  });

  it('lets the higher priority win even with fewer points', () => {
    const reading = classify({
      text: 'enel 860063875 planilla',
      source: 'texto-embebido',
      signatures: [
        makeSignature({ nits: ['860063875'] }),
        makeSignature({ concept: 'Prioritaria', alias: ['planilla'], priority: 9 }),
      ],
    });
    expect(reading.concept).toBe('Prioritaria');
    expect(reading.reason).toContain('“planilla” en el texto');
  });

  it('discards a signature whose exclusion appears in the text', () => {
    const reading = classify({
      text: 'enel solar',
      source: 'texto-embebido',
      signatures: [makeSignature({ excludes: ['solar'] })],
    });
    expect(reading.concept).toBeNull();
    expect(reading.reason).toMatch(/no reconocí al acreedor/i);
    expect(reading.confidence).toBeLessThanOrEqual(0.35);
  });

  it('skips the IBC line when the winner is the payroll form', () => {
    const reading = classify({
      text: 'Planilla PILA\nIBC 1.300.000\nTotal pagado 520.000',
      source: 'texto-embebido',
    });
    expect(reading.concept).toBe('PILA / Seguridad Social');
    expect(reading.value).toBe(520000);
  });

  it('places a written keyword in the tree as a keyword match', () => {
    const tree = makeTree();
    const reading = classify({
      text: 'Factura ENEL total 80.000',
      source: 'ocr',
      signatures: treeSignatures(tree),
      tree,
    });
    expect(reading.inTree).toEqual({
      certainty: 'alta',
      source: 'palabras-clave',
      conceptId: 'luz',
      categoryId: 'servicios',
      candidates: [],
    });
  });

  it('marks a catalogue signature as such, even when the tree lacks the concept', () => {
    const reading = classify({
      text: 'enel',
      source: 'ocr',
      signatures: [makeSignature({ concept: 'Luz' })],
      tree: makeTree(),
    });
    expect(reading.inTree).toMatchObject({ source: 'firma', conceptId: undefined });
    expect(reading.reason).toContain('(ocr)');
  });

  describe('when no signature matches', () => {
    const withoutSignatures = { source: 'texto-embebido' as const, signatures: [] };

    it('resolves a known merchant to one concept of the tree', () => {
      const reading = classify({
        ...withoutSignatures,
        text: 'Compra Carulla\nTotal 45.000',
        tree: makeTree(),
      });
      expect(reading).toMatchObject({
        concept: 'Supermercado',
        category: 'Mercado',
        costCenter: 'Hogar',
        value: 45000,
      });
      expect(reading.inTree).toMatchObject({ certainty: 'alta', source: 'diccionario' });
      expect(reading.reason).toMatch(/un solo concepto/);
      expect(reading.confidence).toBeLessThanOrEqual(0.75);
    });

    it('offers the candidates when the merchant leads to several places', () => {
      const tree = makeTree();
      tree[1] = {
        id: 'oficina',
        name: 'Oficina',
        children: [
          {
            id: 'cafeteria',
            name: 'Cafetería',
            children: [{ id: 'super2', name: 'Supermercado oficina' }],
          },
        ],
      };
      const reading = classify({ ...withoutSignatures, text: 'Carulla', tree });
      expect(reading.concept).toBeNull();
      expect(reading.inTree?.candidates.map((c) => c.id)).toEqual(['super', 'super2']);
      expect(reading.reason).toMatch(/lleva a 2 sitios/);
    });

    it('stops at the category when the tree has no matching concept', () => {
      const tree = makeTree();
      tree[0]!.children = [{ id: 'mercado', name: 'Mercado', children: [] }];
      const reading = classify({ ...withoutSignatures, text: 'Carulla', tree });
      expect(reading).toMatchObject({ concept: null, category: 'Mercado', costCenter: 'Hogar' });
      expect(reading.reason).toMatch(/una categoría, sin concepto/);
    });

    it('gives up when the merchant is unknown or the tree has nothing for it', () => {
      const withTree = classify({ ...withoutSignatures, text: 'zapateria', tree: makeTree() });
      const merchantNotInTree = classify({
        ...withoutSignatures,
        text: 'Carulla',
        tree: [{ id: 'x', name: 'Viajes' }],
      });
      const withoutTree = classify({ ...withoutSignatures, text: 'Carulla' });
      for (const reading of [withTree, merchantNotInTree, withoutTree]) {
        expect(reading.concept).toBeNull();
        expect(reading.inTree).toBeNull();
      }
    });
  });
});

describe('firmasDeConceptos', () => {
  it('turns written keywords into top-priority signatures and skips concepts without them', () => {
    const signatures = conceptSignatures([
      makeConceptWithWords(),
      makeConceptWithWords({ concept: 'Sin palabras', words: [] }),
    ]);
    expect(signatures).toEqual([
      {
        concept: 'Energía',
        category: 'Servicios públicos',
        costCenter: 'Hogar',
        alias: ['enel'],
        nameTokens: ['enel'],
        priority: 100,
      },
    ]);
  });
});

describe('necesitaRevision', () => {
  const reading = (overrides: Partial<Reading>): Reading => ({
    concept: 'Energía',
    category: 'Servicios públicos',
    costCenter: 'Hogar',
    value: 1000,
    date: null,
    confidence: REVIEW_THRESHOLD,
    signals: { text: [], name: [], nit: [], ignoredCollectors: [] },
    reason: '',
    alternatives: [],
    ...overrides,
  });

  it('asks for review below the threshold or with a missing concept or value', () => {
    expect(needsReview(reading({}))).toBe(false);
    expect(needsReview(reading({ confidence: 0.79 }))).toBe(true);
    expect(needsReview(reading({ concept: null }))).toBe(true);
    expect(needsReview(reading({ value: null }))).toBe(true);
  });
});
