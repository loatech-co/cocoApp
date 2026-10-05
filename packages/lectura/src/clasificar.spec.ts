import { clasificar, necesitaRevision, UMBRAL_DE_REVISION, type Lectura } from './clasificar';
import { firmasDeConceptos, firmasDelArbol, type Firma } from './firmas';
import { makeConceptWithWords, makeTree } from './testing/factories';

/** A catalogue signature, owned by the test so the shipped catalogue can change freely. */
function makeSignature(overrides: Partial<Firma> = {}): Firma {
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
    const lectura = clasificar({
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

    expect(lectura).toMatchObject({ concepto: 'Energía', valor: 152300, fecha: '2026-03-15' });
    expect(lectura.señales).toEqual({
      texto: ['enel'],
      nombre: ['enel', 'FACT'],
      nit: ['8600638758'],
      recaudadoresIgnorados: ['bancolombia'],
    });
    expect(lectura.motivo).toBe(
      'Energía por NIT 8600638758 + “enel” en el texto + “enel”, “FACT” en el nombre ' +
        '(texto-embebido). Ignoré bancolombia por ser recaudador.',
    );
    expect(lectura.enElArbol).toBeNull();
  });

  it('lowers confidence for OCR, a close runner-up and a value out of range', () => {
    const base = {
      texto: 'enel\nTotal 152.300',
      firmas: [makeSignature()],
    };
    const limpia = clasificar({ ...base, fuente: 'texto-embebido' });
    const ocr = clasificar({ ...base, fuente: 'ocr' });
    const empatada = clasificar({
      ...base,
      fuente: 'texto-embebido',
      firmas: [makeSignature(), makeSignature({ concepto: 'Otra' })],
    });
    const fueraDeRango = clasificar({
      ...base,
      fuente: 'texto-embebido',
      firmas: [makeSignature({ rango: { min: 1, max: 10 } })],
    });

    expect(ocr.confianza).toBeLessThan(limpia.confianza);
    expect(empatada.confianza).toBeLessThan(limpia.confianza);
    expect(empatada.alternativas).toEqual([{ concepto: 'Otra', puntaje: 30 }]);
    expect(fueraDeRango.confianza).toBeLessThan(limpia.confianza);
  });

  it('lets the higher priority win even with fewer points', () => {
    const lectura = clasificar({
      texto: 'enel 860063875 planilla',
      fuente: 'texto-embebido',
      firmas: [
        makeSignature({ nits: ['860063875'] }),
        makeSignature({ concepto: 'Prioritaria', alias: ['planilla'], prioridad: 9 }),
      ],
    });
    expect(lectura.concepto).toBe('Prioritaria');
    expect(lectura.motivo).toContain('“planilla” en el texto');
  });

  it('discards a signature whose exclusion appears in the text', () => {
    const lectura = clasificar({
      texto: 'enel solar',
      fuente: 'texto-embebido',
      firmas: [makeSignature({ excluye: ['solar'] })],
    });
    expect(lectura.concepto).toBeNull();
    expect(lectura.motivo).toMatch(/no reconocí al acreedor/i);
    expect(lectura.confianza).toBeLessThanOrEqual(0.35);
  });

  it('skips the IBC line when the winner is the payroll form', () => {
    const lectura = clasificar({
      texto: 'Planilla PILA\nIBC 1.300.000\nTotal pagado 520.000',
      fuente: 'texto-embebido',
    });
    expect(lectura.concepto).toBe('PILA / Seguridad Social');
    expect(lectura.valor).toBe(520000);
  });

  it('places a written keyword in the tree as a keyword match', () => {
    const arbol = makeTree();
    const lectura = clasificar({
      texto: 'Factura ENEL total 80.000',
      fuente: 'ocr',
      firmas: firmasDelArbol(arbol),
      arbol,
    });
    expect(lectura.enElArbol).toEqual({
      certeza: 'alta',
      fuente: 'palabras-clave',
      conceptoId: 'luz',
      categoriaId: 'servicios',
      candidatos: [],
    });
  });

  it('marks a catalogue signature as such, even when the tree lacks the concept', () => {
    const lectura = clasificar({
      texto: 'enel',
      fuente: 'ocr',
      firmas: [makeSignature({ concepto: 'Luz' })],
      arbol: makeTree(),
    });
    expect(lectura.enElArbol).toMatchObject({ fuente: 'firma', conceptoId: undefined });
    expect(lectura.motivo).toContain('(ocr)');
  });

  describe('when no signature matches', () => {
    const sinFirmas = { fuente: 'texto-embebido' as const, firmas: [] };

    it('resolves a known merchant to one concept of the tree', () => {
      const lectura = clasificar({
        ...sinFirmas,
        texto: 'Compra Carulla\nTotal 45.000',
        arbol: makeTree(),
      });
      expect(lectura).toMatchObject({
        concepto: 'Supermercado',
        categoria: 'Mercado',
        centro: 'Hogar',
        valor: 45000,
      });
      expect(lectura.enElArbol).toMatchObject({ certeza: 'alta', fuente: 'diccionario' });
      expect(lectura.motivo).toMatch(/un solo concepto/);
      expect(lectura.confianza).toBeLessThanOrEqual(0.75);
    });

    it('offers the candidates when the merchant leads to several places', () => {
      const arbol = makeTree();
      arbol[1] = {
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
      const lectura = clasificar({ ...sinFirmas, texto: 'Carulla', arbol });
      expect(lectura.concepto).toBeNull();
      expect(lectura.enElArbol?.candidatos.map((c) => c.id)).toEqual(['super', 'super2']);
      expect(lectura.motivo).toMatch(/lleva a 2 sitios/);
    });

    it('stops at the category when the tree has no matching concept', () => {
      const arbol = makeTree();
      arbol[0]!.children = [{ id: 'mercado', name: 'Mercado', children: [] }];
      const lectura = clasificar({ ...sinFirmas, texto: 'Carulla', arbol });
      expect(lectura).toMatchObject({ concepto: null, categoria: 'Mercado', centro: 'Hogar' });
      expect(lectura.motivo).toMatch(/una categoría, sin concepto/);
    });

    it('gives up when the merchant is unknown or the tree has nothing for it', () => {
      const conArbol = clasificar({ ...sinFirmas, texto: 'zapateria', arbol: makeTree() });
      const sinComercioEnElArbol = clasificar({
        ...sinFirmas,
        texto: 'Carulla',
        arbol: [{ id: 'x', name: 'Viajes' }],
      });
      const sinArbol = clasificar({ ...sinFirmas, texto: 'Carulla' });
      for (const lectura of [conArbol, sinComercioEnElArbol, sinArbol]) {
        expect(lectura.concepto).toBeNull();
        expect(lectura.enElArbol).toBeNull();
      }
    });
  });
});

describe('firmasDeConceptos', () => {
  it('turns written keywords into top-priority signatures and skips concepts without them', () => {
    const firmas = firmasDeConceptos([
      makeConceptWithWords(),
      makeConceptWithWords({ concepto: 'Sin palabras', palabras: [] }),
    ]);
    expect(firmas).toEqual([
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
  const lectura = (overrides: Partial<Lectura>): Lectura => ({
    concepto: 'Energía',
    categoria: 'Servicios públicos',
    centro: 'Hogar',
    valor: 1000,
    fecha: null,
    confianza: UMBRAL_DE_REVISION,
    señales: { texto: [], nombre: [], nit: [], recaudadoresIgnorados: [] },
    motivo: '',
    alternativas: [],
    ...overrides,
  });

  it('asks for review below the threshold or with a missing concept or value', () => {
    expect(necesitaRevision(lectura({}))).toBe(false);
    expect(necesitaRevision(lectura({ confianza: 0.79 }))).toBe(true);
    expect(necesitaRevision(lectura({ concepto: null }))).toBe(true);
    expect(necesitaRevision(lectura({ valor: null }))).toBe(true);
  });
});
