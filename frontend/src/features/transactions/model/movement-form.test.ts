import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  indexarArbol,
  type ClasificacionEnElArbol,
  type Lectura,
  type NodoBuscable,
} from '@coco/lectura';
import type { Category, PagoPendiente, Transaction } from '@coco/types';

import {
  hoyEnBogota,
  initialAmountAndDate,
  mayuscula,
  nombreDelTipo,
  proposalFromReading,
  proposalFromText,
  unreadNotice,
} from './movement-form';

const TREE: NodoBuscable[] = [
  {
    id: 2,
    name: 'Costos variables',
    children: [
      {
        id: 20,
        name: 'Alimentación',
        children: [
          { id: 200, name: 'Mercado', palabras_clave: [] },
          { id: 201, name: 'Restaurantes', palabras_clave: ['rappi'] },
        ],
      },
      { id: 21, name: 'Transporte', children: [] },
      { id: 22, name: 'Hogar', children: [{ id: 220, name: 'Mercado', palabras_clave: [] }] },
    ],
  },
];

const ONE_MARKET: NodoBuscable[] = [
  {
    id: 2,
    name: 'Costos variables',
    children: [{ id: 20, name: 'Alimentación', children: [{ id: 200, name: 'Mercado' }] }],
  },
];

const CATEGORY_TREE = TREE as unknown as Category[];

function reading(parts: Partial<Lectura>): Lectura {
  return {
    concepto: null,
    categoria: null,
    centro: null,
    valor: null,
    fecha: null,
    confianza: 0,
    señales: { texto: [], nombre: [], nit: [], recaudadoresIgnorados: [] },
    motivo: '',
    alternativas: [],
    ...parts,
  };
}

describe('hoyEnBogota', () => {
  afterEach(() => vi.useRealTimers());

  it('is still the previous day in the first hours after UTC midnight', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-01T03:00:00Z'));

    expect(hoyEnBogota()).toBe('2026-02-28');
  });
});

describe('nombreDelTipo and mayuscula', () => {
  it('names an income and everything else as an expense', () => {
    expect(nombreDelTipo('income')).toBe('ingreso');
    expect(nombreDelTipo('expense')).toBe('gasto');
  });

  it('capitalises the first letter only', () => {
    expect(mayuscula('gasto fijo')).toBe('Gasto fijo');
    expect(mayuscula('')).toBe('');
  });
});

describe('initialAmountAndDate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-20T15:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  const payment = (parts: Partial<PagoPendiente>) =>
    ({
      expected_amount: '120000.00',
      due_date: '2026-05-05',
      varios_pagos: false,
      ...parts,
    }) as PagoPendiente;

  it('opens a movement with its own amount and date', () => {
    const movement = { amount: '45000.50', date: '2026-04-02' } as Transaction;

    expect(initialAmountAndDate(movement, payment({}))).toEqual({
      amount: '45000.5',
      date: '2026-04-02',
    });
  });

  it('confirms a pending payment with the expected amount on its due date', () => {
    expect(initialAmountAndDate(null, payment({}))).toEqual({
      amount: '120000',
      date: '2026-05-05',
    });
  });

  it('leaves the amount empty and uses today for a payment made in parts', () => {
    expect(initialAmountAndDate(null, payment({ varios_pagos: true }))).toEqual({
      amount: '',
      date: '2026-05-20',
    });
  });

  it('leaves the amount empty when nothing is expected yet', () => {
    expect(initialAmountAndDate(undefined, payment({ expected_amount: null }))).toEqual({
      amount: '',
      date: '2026-05-05',
    });
  });

  it('starts a blank movement empty and dated today', () => {
    expect(initialAmountAndDate(null, null)).toEqual({ amount: '', date: '2026-05-20' });
  });
});

describe('proposalFromText', () => {
  const index = indexarArbol(TREE);

  it('proposes the only concept a keyword leads to', () => {
    expect(proposalFromText(index, 'rappi')).toEqual({
      categoryId: 201,
      origen: 'palabras-clave',
    });
  });

  it('proposes nothing for text with no known terms', () => {
    expect(proposalFromText(index, 'xqzw')).toBeNull();
  });

  it('proposes the concept the dictionary leads to when it is the only one', () => {
    expect(proposalFromText(indexarArbol(ONE_MARKET), 'koba')).toEqual({
      categoryId: 200,
      origen: 'diccionario',
    });
  });

  it('never picks between two concepts: it shows both as candidates', () => {
    const proposal = proposalFromText(index, 'koba');

    expect(proposal).toMatchObject({ categoryId: undefined, origen: 'diccionario' });
    expect(proposal?.candidatos?.map((c) => c.id).sort()).toEqual([200, 220]);
    expect(proposal?.candidatos?.[0]?.ruta).toContain(' › ');
  });

  it('proposes the category when the dictionary leads only that far', () => {
    expect(proposalFromText(index, 'uber')).toMatchObject({
      categoryId: 21,
      origen: 'diccionario',
    });
  });
});

describe('proposalFromReading', () => {
  it('finds the concept by name, ignoring accents, when the reading has no ids', () => {
    const tree = [
      {
        id: 1,
        name: 'C',
        children: [{ id: 10, name: 'G', children: [{ id: 100, name: 'Celsia (Energía)' }] }],
      },
    ] as unknown as Category[];

    expect(proposalFromReading(reading({ concepto: 'Celsia (Energia)' }), tree)).toEqual({
      categoryId: 100,
      origen: 'palabras-clave',
    });
  });

  it('proposes nothing when the named concept is not in the tree', () => {
    expect(proposalFromReading(reading({ concepto: 'Celsia' }), CATEGORY_TREE)).toBeNull();
    expect(proposalFromReading(reading({}), CATEGORY_TREE)).toBeNull();
  });

  it('proposes the concept of a high-certainty reading with its source', () => {
    const enElArbol = {
      certeza: 'alta',
      fuente: 'historial',
      conceptoId: '200',
      candidatos: [],
    } satisfies ClasificacionEnElArbol;

    expect(proposalFromReading(reading({ enElArbol }), CATEGORY_TREE)).toEqual({
      categoryId: 200,
      origen: 'historial',
    });
  });

  it('ranks the system catalogue as keywords', () => {
    const enElArbol = {
      certeza: 'alta',
      fuente: 'firma',
      conceptoId: 201,
      candidatos: [],
    } satisfies ClasificacionEnElArbol;

    expect(proposalFromReading(reading({ enElArbol }), CATEGORY_TREE)?.origen).toBe(
      'palabras-clave',
    );
  });

  it('proposes the category and shows the candidates of a medium-certainty reading', () => {
    const enElArbol = {
      certeza: 'media',
      fuente: 'diccionario',
      categoriaId: '20',
      candidatos: [{ id: '200', nombre: 'Mercado', ruta: 'Costos variables › Alimentación' }],
    } satisfies ClasificacionEnElArbol;

    expect(proposalFromReading(reading({ enElArbol }), CATEGORY_TREE)).toEqual({
      categoryId: 20,
      origen: 'diccionario',
      candidatos: [{ id: 200, nombre: 'Mercado', ruta: 'Costos variables › Alimentación' }],
    });
  });

  it('leaves the category empty when the candidates span several', () => {
    const enElArbol = {
      certeza: 'media',
      fuente: 'palabras-clave',
      candidatos: [],
    } satisfies ClasificacionEnElArbol;

    expect(proposalFromReading(reading({ enElArbol }), CATEGORY_TREE)).toEqual({
      categoryId: undefined,
      origen: 'palabras-clave',
      candidatos: [],
    });
  });

  it('keeps the source but proposes nothing when a high reading has no concept', () => {
    const enElArbol = {
      certeza: 'alta',
      fuente: 'diccionario',
      candidatos: [],
    } satisfies ClasificacionEnElArbol;

    expect(proposalFromReading(reading({ enElArbol }), CATEGORY_TREE)).toEqual({
      categoryId: undefined,
      origen: 'diccionario',
    });
  });
});

describe('unreadNotice', () => {
  it('says nothing when the reading found an amount, a date or a concept', () => {
    expect(unreadNotice(reading({ valor: 1 }), 'texto')).toBeNull();
    expect(unreadNotice(reading({ fecha: '2026-01-01' }), '')).toBeNull();
    expect(unreadNotice(reading({ concepto: 'Mercado' }), '')).toBeNull();
  });

  it('says no text could be extracted from an unreadable file', () => {
    expect(unreadNotice(reading({}), '   ')).toMatch(/^No se pudo extraer el texto/);
  });

  it('says the file was read but its shape was not recognised', () => {
    expect(unreadNotice(reading({}), 'FACTURA 123')).toMatch(/^Se leyó el archivo/);
  });
});
