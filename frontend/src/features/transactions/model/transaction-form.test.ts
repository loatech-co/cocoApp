import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CategoryTree as Category } from '@/shared/api/categories';
import type { PendingPayment, Transaction } from '@/shared/api/generated/model';
import {
  indexTree,
  type TreeClassification,
  type Reading,
  type SearchableNode,
} from '@coco/receipt-parser';

import {
  todayInBogota,
  initialAmountAndDate,
  capitalize,
  typeName,
  proposalFromReading,
  proposalFromText,
  unreadNotice,
} from './transaction-form';

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
      { id: 22, name: 'Hogar', children: [{ id: 220, name: 'Mercado', keywords: [] }] },
    ],
  },
];

const ONE_MARKET: SearchableNode[] = [
  {
    id: 2,
    name: 'Costos variables',
    children: [{ id: 20, name: 'Alimentación', children: [{ id: 200, name: 'Mercado' }] }],
  },
];

const CATEGORY_TREE = TREE as unknown as Category[];

function reading(parts: Partial<Reading>): Reading {
  return {
    concept: null,
    category: null,
    costCenter: null,
    value: null,
    date: null,
    confidence: 0,
    signals: { text: [], name: [], nit: [], ignoredCollectors: [] },
    reason: '',
    alternatives: [],
    ...parts,
  };
}

describe('todayInBogota', () => {
  afterEach(() => vi.useRealTimers());

  it('is still the previous day in the first hours after UTC midnight', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-01T03:00:00Z'));

    expect(todayInBogota()).toBe('2026-02-28');
  });
});

describe('typeName and capitalize', () => {
  it('names an income and everything else as an expense', () => {
    expect(typeName('income')).toBe('ingreso');
    expect(typeName('expense')).toBe('gasto');
  });

  it('capitalises the first letter only', () => {
    expect(capitalize('gasto fijo')).toBe('Gasto fijo');
    expect(capitalize('')).toBe('');
  });
});

describe('initialAmountAndDate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-20T15:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  const payment = (parts: Partial<PendingPayment>) =>
    ({
      expectedAmount: '120000.00',
      dueDate: '2026-05-05',
      isMultiPayment: false,
      ...parts,
    }) as PendingPayment;

  it('opens a transaction with its own amount and date', () => {
    const transaction = { amount: '45000.50', date: '2026-04-02' } as Transaction;

    expect(initialAmountAndDate(transaction, payment({}))).toEqual({
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
    expect(initialAmountAndDate(null, payment({ isMultiPayment: true }))).toEqual({
      amount: '',
      date: '2026-05-20',
    });
  });

  it('leaves the amount empty when nothing is expected yet', () => {
    expect(initialAmountAndDate(undefined, payment({ expectedAmount: null }))).toEqual({
      amount: '',
      date: '2026-05-05',
    });
  });

  it('starts a blank transaction empty and dated today', () => {
    expect(initialAmountAndDate(null, null)).toEqual({ amount: '', date: '2026-05-20' });
  });
});

describe('proposalFromText', () => {
  const index = indexTree(TREE);

  it('proposes the only concept a keyword leads to', () => {
    expect(proposalFromText(index, 'rappi')).toEqual({
      categoryId: 201,
      origin: 'keywords',
    });
  });

  it('proposes nothing for text with no known terms', () => {
    expect(proposalFromText(index, 'xqzw')).toBeNull();
  });

  it('proposes the concept the dictionary leads to when it is the only one', () => {
    expect(proposalFromText(indexTree(ONE_MARKET), 'koba')).toEqual({
      categoryId: 200,
      origin: 'dictionary',
    });
  });

  it('never picks between two concepts: it shows both as candidates', () => {
    const proposal = proposalFromText(index, 'koba');

    expect(proposal).toMatchObject({ categoryId: undefined, origin: 'dictionary' });
    expect(proposal?.candidates?.map((c) => c.id).sort()).toEqual([200, 220]);
    expect(proposal?.candidates?.[0]?.path).toContain(' › ');
  });

  it('proposes the category when the dictionary leads only that far', () => {
    expect(proposalFromText(index, 'uber')).toMatchObject({
      categoryId: 21,
      origin: 'dictionary',
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

    expect(proposalFromReading(reading({ concept: 'Celsia (Energia)' }), tree)).toEqual({
      categoryId: 100,
      origin: 'keywords',
    });
  });

  it('proposes nothing when the named concept is not in the tree', () => {
    expect(proposalFromReading(reading({ concept: 'Celsia' }), CATEGORY_TREE)).toBeNull();
    expect(proposalFromReading(reading({}), CATEGORY_TREE)).toBeNull();
  });

  it('proposes the concept of a high-certainty reading with its source', () => {
    const inTree = {
      certainty: 'high',
      source: 'history',
      conceptId: '200',
      candidates: [],
    } satisfies TreeClassification;

    expect(proposalFromReading(reading({ inTree }), CATEGORY_TREE)).toEqual({
      categoryId: 200,
      origin: 'history',
    });
  });

  it('ranks the system catalogue as keywords', () => {
    const inTree = {
      certainty: 'high',
      source: 'signature',
      conceptId: 201,
      candidates: [],
    } satisfies TreeClassification;

    expect(proposalFromReading(reading({ inTree }), CATEGORY_TREE)?.origin).toBe('keywords');
  });

  it('proposes the category and shows the candidates of a medium-certainty reading', () => {
    const inTree = {
      certainty: 'medium',
      source: 'dictionary',
      categoryId: '20',
      candidates: [{ id: '200', name: 'Mercado', path: 'Costos variables › Alimentación' }],
    } satisfies TreeClassification;

    expect(proposalFromReading(reading({ inTree }), CATEGORY_TREE)).toEqual({
      categoryId: 20,
      origin: 'dictionary',
      candidates: [{ id: 200, name: 'Mercado', path: 'Costos variables › Alimentación' }],
    });
  });

  it('leaves the category empty when the candidates span several', () => {
    const inTree = {
      certainty: 'medium',
      source: 'keywords',
      candidates: [],
    } satisfies TreeClassification;

    expect(proposalFromReading(reading({ inTree }), CATEGORY_TREE)).toEqual({
      categoryId: undefined,
      origin: 'keywords',
      candidates: [],
    });
  });

  it('keeps the source but proposes nothing when a high reading has no concept', () => {
    const inTree = {
      certainty: 'high',
      source: 'dictionary',
      candidates: [],
    } satisfies TreeClassification;

    expect(proposalFromReading(reading({ inTree }), CATEGORY_TREE)).toEqual({
      categoryId: undefined,
      origin: 'dictionary',
    });
  });
});

describe('unreadNotice', () => {
  it('says nothing when the reading found an amount, a date or a concept', () => {
    expect(unreadNotice(reading({ value: 1 }), 'texto')).toBeNull();
    expect(unreadNotice(reading({ date: '2026-01-01' }), '')).toBeNull();
    expect(unreadNotice(reading({ concept: 'Mercado' }), '')).toBeNull();
  });

  it('says no text could be extracted from an unreadable file', () => {
    expect(unreadNotice(reading({}), '   ')).toMatch(/^No se pudo extraer el texto/);
  });

  it('says the file was read but its shape was not recognised', () => {
    expect(unreadNotice(reading({}), 'FACTURA 123')).toMatch(/^Se leyó el archivo/);
  });
});
