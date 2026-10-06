import type { SearchableNode } from '@coco/receipt-parser';

import { interpretar, pesos, resumenDe, type ClasificacionInterpretada } from './interpretar';

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
        children: [{ id: '110', name: 'Aseo', palabras_clave: ['detergente'] }],
      },
    ],
  },
];

const context = (historial: { categoryId: string; confidence: number } | null = null) => ({
  arbol: TREE,
  historial,
  hoy: '2026-10-04',
});

describe('interpretar', () => {
  it('uses a history that points to a category, as a doubt', () => {
    const result = interpretar(
      { comercio: 'Tienda' },
      context({ categoryId: '10', confidence: 50 }),
    );
    expect(result.clasificacion).toMatchObject({
      certeza: 'media',
      fuente: 'historial',
      conceptoId: null,
      categoriaId: '10',
      nombre: 'Mercado',
    });
    expect(result.clasificacion.candidatos).toHaveLength(1);
  });

  it('ignores a history that points to a cost center', () => {
    const result = interpretar({ comercio: 'zzz' }, context({ categoryId: '1', confidence: 95 }));
    expect(result.clasificacion.fuente).not.toBe('historial');
  });

  it('stops at the category when the dictionary knows the merchant but the tree has no concept', () => {
    const result = interpretar({ comercio: 'Carulla' }, context());
    expect(result.clasificacion).toMatchObject({
      certeza: 'media',
      fuente: 'diccionario',
      conceptoId: null,
      categoriaId: '10',
      nombre: 'Mercado',
    });
    expect(result.porRevisar).toBe(true);
  });

  it.each([
    [0, null],
    ['', null],
    ['-5', null],
    ['abc', null],
    ['12,5', '12.5'],
    [4500, '4500'],
  ])('reads the structured amount %p as %p', (monto, expected) => {
    expect(interpretar({ monto }, context()).monto).toBe(expected);
  });

  it.each(['2026-13-45', '04/10/2026', '2026-10-05', null])(
    'drops the structured date %p',
    (fecha) => {
      expect(interpretar({ fecha }, context()).fecha).toBeNull();
    },
  );
});

describe('resumenDe', () => {
  const classification = (overrides: Partial<ClasificacionInterpretada>) => ({
    certeza: 'ninguna' as const,
    fuente: null,
    conceptoId: null,
    categoriaId: null,
    nombre: null,
    candidatos: [],
    motivo: '',
    ...overrides,
  });

  it('says what is missing when there is no amount', () => {
    expect(resumenDe(null, classification({ certeza: 'alta', nombre: 'Aseo' }))).toBe(
      'Registrado: sin valor · Aseo',
    );
    expect(resumenDe(null, classification({ certeza: 'media', nombre: 'Aseo' }))).toBe(
      'Registrado: sin valor · Aseo (por revisar)',
    );
    expect(resumenDe(null, classification({}))).toBe('Pendiente de clasificar');
  });
});

describe('pesos', () => {
  it('writes a non-number as zero pesos', () => {
    expect(pesos('abc')).toBe('$0');
  });
});
