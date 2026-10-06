import { classify, needsReview, REVIEW_THRESHOLD, type Reading } from './classify';
import { conceptSignatures, treeSignatures, type Signature } from './signatures';
import { makeConceptWithWords, makeTree } from './testing/factories';

/** A catalogue signature, owned by the test so the shipped catalogue can change freely. */
function makeSignature(overrides: Partial<Signature> = {}): Signature {
  return {
    concepto: 'Energía',
    categoria: 'Servicios públicos',
    centro: 'Hogar',
    alias: ['enel'],
    ...overrides,
  };
}

describe('clasificar', () => {
  it('recognises the creditor by NIT, alias and file name, and explains it', () => {
    const reading = classify({
      texto: 'ENEL Colombia NIT 860.063.875-8\nPagado en Bancolombia\nTotal a pagar $ 152.300',
      fuente: 'texto-embebido',
      nombreDeArchivo: 'FACT-enel-marzo.pdf',
      periodo: '2026-03',
      firmas: [
        makeSignature({
          nits: ['8600638758'],
          tokensDeNombre: ['enel'],
          prefijosDeNombre: ['fact'],
          rango: { min: 50_000, max: 500_000 },
        }),
      ],
    });

    expect(reading).toMatchObject({ concepto: 'Energía', valor: 152300, fecha: '2026-03-15' });
    expect(reading.señales).toEqual({
      texto: ['enel'],
      nombre: ['enel', 'FACT'],
      nit: ['8600638758'],
      recaudadoresIgnorados: ['bancolombia'],
    });
    expect(reading.motivo).toBe(
      'Energía por NIT 8600638758 + “enel” en el texto + “enel”, “FACT” en el nombre ' +
        '(texto-embebido). Ignoré bancolombia por ser recaudador.',
    );
    expect(reading.enElArbol).toBeNull();
  });

  it('lowers confidence for OCR, a close runner-up and a value out of range', () => {
    const base = {
      texto: 'enel\nTotal 152.300',
      firmas: [makeSignature()],
    };
    const clean = classify({ ...base, fuente: 'texto-embebido' });
    const ocr = classify({ ...base, fuente: 'ocr' });
    const tied = classify({
      ...base,
      fuente: 'texto-embebido',
      firmas: [makeSignature(), makeSignature({ concepto: 'Otra' })],
    });
    const outOfRange = classify({
      ...base,
      fuente: 'texto-embebido',
      firmas: [makeSignature({ rango: { min: 1, max: 10 } })],
    });

    expect(ocr.confianza).toBeLessThan(clean.confianza);
    expect(tied.confianza).toBeLessThan(clean.confianza);
    expect(tied.alternativas).toEqual([{ concepto: 'Otra', puntaje: 30 }]);
    expect(outOfRange.confianza).toBeLessThan(clean.confianza);
  });

  it('lets the higher priority win even with fewer points', () => {
    const reading = classify({
      texto: 'enel 860063875 planilla',
      fuente: 'texto-embebido',
      firmas: [
        makeSignature({ nits: ['860063875'] }),
        makeSignature({ concepto: 'Prioritaria', alias: ['planilla'], prioridad: 9 }),
      ],
    });
    expect(reading.concepto).toBe('Prioritaria');
    expect(reading.motivo).toContain('“planilla” en el texto');
  });

  it('discards a signature whose exclusion appears in the text', () => {
    const reading = classify({
      texto: 'enel solar',
      fuente: 'texto-embebido',
      firmas: [makeSignature({ excluye: ['solar'] })],
    });
    expect(reading.concepto).toBeNull();
    expect(reading.motivo).toMatch(/no reconocí al acreedor/i);
    expect(reading.confianza).toBeLessThanOrEqual(0.35);
  });

  it('skips the IBC line when the winner is the payroll form', () => {
    const reading = classify({
      texto: 'Planilla PILA\nIBC 1.300.000\nTotal pagado 520.000',
      fuente: 'texto-embebido',
    });
    expect(reading.concepto).toBe('PILA / Seguridad Social');
    expect(reading.valor).toBe(520000);
  });

  it('places a written keyword in the tree as a keyword match', () => {
    const tree = makeTree();
    const reading = classify({
      texto: 'Factura ENEL total 80.000',
      fuente: 'ocr',
      firmas: treeSignatures(tree),
      arbol: tree,
    });
    expect(reading.enElArbol).toEqual({
      certeza: 'alta',
      fuente: 'palabras-clave',
      conceptoId: 'luz',
      categoriaId: 'servicios',
      candidatos: [],
    });
  });

  it('marks a catalogue signature as such, even when the tree lacks the concept', () => {
    const reading = classify({
      texto: 'enel',
      fuente: 'ocr',
      firmas: [makeSignature({ concepto: 'Luz' })],
      arbol: makeTree(),
    });
    expect(reading.enElArbol).toMatchObject({ fuente: 'firma', conceptoId: undefined });
    expect(reading.motivo).toContain('(ocr)');
  });

  describe('when no signature matches', () => {
    const withoutSignatures = { fuente: 'texto-embebido' as const, firmas: [] };

    it('resolves a known merchant to one concept of the tree', () => {
      const reading = classify({
        ...withoutSignatures,
        texto: 'Compra Carulla\nTotal 45.000',
        arbol: makeTree(),
      });
      expect(reading).toMatchObject({
        concepto: 'Supermercado',
        categoria: 'Mercado',
        centro: 'Hogar',
        valor: 45000,
      });
      expect(reading.enElArbol).toMatchObject({ certeza: 'alta', fuente: 'diccionario' });
      expect(reading.motivo).toMatch(/un solo concepto/);
      expect(reading.confianza).toBeLessThanOrEqual(0.75);
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
      const reading = classify({ ...withoutSignatures, texto: 'Carulla', arbol: tree });
      expect(reading.concepto).toBeNull();
      expect(reading.enElArbol?.candidatos.map((c) => c.id)).toEqual(['super', 'super2']);
      expect(reading.motivo).toMatch(/lleva a 2 sitios/);
    });

    it('stops at the category when the tree has no matching concept', () => {
      const tree = makeTree();
      tree[0]!.children = [{ id: 'mercado', name: 'Mercado', children: [] }];
      const reading = classify({ ...withoutSignatures, texto: 'Carulla', arbol: tree });
      expect(reading).toMatchObject({ concepto: null, categoria: 'Mercado', centro: 'Hogar' });
      expect(reading.motivo).toMatch(/una categoría, sin concepto/);
    });

    it('gives up when the merchant is unknown or the tree has nothing for it', () => {
      const withTree = classify({ ...withoutSignatures, texto: 'zapateria', arbol: makeTree() });
      const merchantNotInTree = classify({
        ...withoutSignatures,
        texto: 'Carulla',
        arbol: [{ id: 'x', name: 'Viajes' }],
      });
      const withoutTree = classify({ ...withoutSignatures, texto: 'Carulla' });
      for (const reading of [withTree, merchantNotInTree, withoutTree]) {
        expect(reading.concepto).toBeNull();
        expect(reading.enElArbol).toBeNull();
      }
    });
  });
});

describe('firmasDeConceptos', () => {
  it('turns written keywords into top-priority signatures and skips concepts without them', () => {
    const signatures = conceptSignatures([
      makeConceptWithWords(),
      makeConceptWithWords({ concepto: 'Sin palabras', palabras: [] }),
    ]);
    expect(signatures).toEqual([
      {
        concepto: 'Energía',
        categoria: 'Servicios públicos',
        centro: 'Hogar',
        alias: ['enel'],
        tokensDeNombre: ['enel'],
        prioridad: 100,
      },
    ]);
  });
});

describe('necesitaRevision', () => {
  const reading = (overrides: Partial<Reading>): Reading => ({
    concepto: 'Energía',
    categoria: 'Servicios públicos',
    centro: 'Hogar',
    valor: 1000,
    fecha: null,
    confianza: REVIEW_THRESHOLD,
    señales: { texto: [], nombre: [], nit: [], recaudadoresIgnorados: [] },
    motivo: '',
    alternativas: [],
    ...overrides,
  });

  it('asks for review below the threshold or with a missing concept or value', () => {
    expect(needsReview(reading({}))).toBe(false);
    expect(needsReview(reading({ confianza: 0.79 }))).toBe(true);
    expect(needsReview(reading({ concepto: null }))).toBe(true);
    expect(needsReview(reading({ valor: null }))).toBe(true);
  });
});
