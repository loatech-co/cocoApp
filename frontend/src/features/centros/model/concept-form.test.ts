import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CategoryTree as Category } from '@/shared/api/categories';

import {
  conceptChanges,
  conceptFields,
  findTwin,
  initialRecurrence,
  newConcept,
  siblingCategories,
} from './concept-form';
import type { Recurrencia } from '../components/campos-de-recurrencia';

function node(id: number, name: string, extra: Partial<Category> = {}): Category {
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
    ...extra,
  } as Category;
}

const TREE: Category[] = [
  node(1, 'Costos fijos', {
    children: [
      node(10, 'Vivienda', {
        parentId: 1,
        children: [
          node(100, 'Arriendo', { parentId: 10 }),
          node(101, 'Movistar', { parentId: 10 }),
        ],
      }),
      node(11, 'Servicios públicos', { parentId: 1, children: [] }),
    ],
  }),
  node(2, 'Costos variables', {
    children: [node(20, 'Mercado', { parentId: 2, children: [node(200, 'D1', { parentId: 20 })] })],
  }),
  node(3, 'Sin ramas'),
];

const RECURRENCE: Recurrencia = {
  recurrente: true,
  periodicidad: 'quarterly',
  diaDePago: 15,
  mesDePago: 3,
  presupuesto: '180000',
  pagoAutomatico: false,
  variosPagos: false,
};

describe('initialRecurrence', () => {
  afterEach(() => vi.useRealTimers());

  it('falls back to a monthly, non-recurring setup starting in the current month', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 10));

    expect(initialRecurrence(null)).toEqual({
      recurrente: false,
      periodicidad: 'monthly',
      diaDePago: 1,
      mesDePago: 7,
      presupuesto: '',
      pagoAutomatico: false,
      variosPagos: false,
    });
  });

  it('reads the concept recurrence and drops the decimals of the budget', () => {
    const concept = node(100, 'Arriendo', {
      isRecurring: true,
      periodicity: 'annual',
      paymentDay: 5,
      paymentMonth: 2,
      budget: '180000.00',
      isAutoPaid: true,
      isMultiPayment: false,
    });

    expect(initialRecurrence(concept)).toEqual({
      recurrente: true,
      periodicidad: 'annual',
      diaDePago: 5,
      mesDePago: 2,
      presupuesto: '180000',
      pagoAutomatico: true,
      variosPagos: false,
    });
  });

  it('rounds a fractional budget to whole pesos', () => {
    const concept = node(100, 'Arriendo', { budget: '99.6' });

    expect(initialRecurrence(concept).presupuesto).toBe('100');
  });
});

describe('siblingCategories', () => {
  it('offers only the categories of the concept own cost center', () => {
    expect(siblingCategories(TREE, TREE[0]!.children![0]!.children![0])).toEqual([
      { value: '10', label: 'Vivienda' },
      { value: '11', label: 'Servicios públicos' },
    ]);
  });

  it('offers nothing for a new concept with no parent', () => {
    expect(siblingCategories(TREE, undefined)).toEqual([]);
  });
});

describe('findTwin', () => {
  it('finds a concept with the same name ignoring case and extra spaces', () => {
    expect(findTwin(TREE, null, '  movistar ')?.id).toBe(101);
    expect(findTwin(TREE, null, 'd1')?.id).toBe(200);
  });

  it('collapses inner runs of spaces', () => {
    const tree = [
      node(1, 'C', {
        children: [node(10, 'G', { children: [node(100, 'Claro  Móvil')] })],
      }),
    ];

    expect(findTwin(tree, null, 'claro móvil')?.id).toBe(100);
  });

  it('does not report the concept being edited as its own twin', () => {
    const editing = TREE[0]!.children![0]!.children![1]!;

    expect(findTwin(TREE, editing, 'Movistar')).toBeUndefined();
  });

  it('only compares concepts, not categories or cost centers', () => {
    expect(findTwin(TREE, null, 'Vivienda')).toBeUndefined();
    expect(findTwin(TREE, null, 'Costos fijos')).toBeUndefined();
  });
});

describe('conceptFields', () => {
  it('saves the full recurrence of a quarterly concept', () => {
    expect(conceptFields('  Arriendo ', RECURRENCE, ['arriendo'])).toEqual({
      name: 'Arriendo',
      isRecurring: true,
      periodicity: 'quarterly',
      paymentDay: 15,
      paymentMonth: 3,
      budget: 180000,
      isAutoPaid: false,
      isMultiPayment: false,
      keywords: ['arriendo'],
    });
  });

  it('drops the month of a monthly concept', () => {
    expect(conceptFields('A', { ...RECURRENCE, periodicidad: 'monthly' }, []).paymentMonth).toBe(
      null,
    );
  });

  it('sends an empty budget as null, not zero', () => {
    expect(conceptFields('A', { ...RECURRENCE, presupuesto: '  ' }, []).budget).toBeNull();
  });

  it('keeps an explicit zero budget', () => {
    expect(conceptFields('A', { ...RECURRENCE, presupuesto: '0' }, []).budget).toBe(0);
  });

  it('clears everything recurring when the concept stops recurring', () => {
    const fields = conceptFields(
      'A',
      { ...RECURRENCE, recurrente: false, pagoAutomatico: true, variosPagos: true },
      [],
    );

    expect(fields).toMatchObject({
      isRecurring: false,
      periodicity: null,
      paymentDay: null,
      paymentMonth: null,
      budget: null,
      isAutoPaid: false,
      isMultiPayment: false,
    });
  });

  it('never sends automatic payment together with several payments', () => {
    const fields = conceptFields(
      'A',
      { ...RECURRENCE, pagoAutomatico: true, variosPagos: true },
      [],
    );

    expect(fields.isAutoPaid).toBe(true);
    expect(fields.isMultiPayment).toBe(false);
  });

  it('sends several payments when automatic payment is off', () => {
    expect(conceptFields('A', { ...RECURRENCE, variosPagos: true }, []).isMultiPayment).toBe(true);
  });
});

describe('conceptChanges', () => {
  const fields = conceptFields('Arriendo', RECURRENCE, []);
  const concept = node(100, 'Arriendo', { parentId: 10 });

  it('includes the new category when it changed', () => {
    expect(conceptChanges(fields, '11', concept)).toEqual({ ...fields, parentId: 11 });
  });

  it('leaves the category out when it is the same one', () => {
    expect(conceptChanges(fields, '10', concept)).not.toHaveProperty('parentId');
  });

  it('leaves the category out when none is chosen', () => {
    expect(conceptChanges(fields, '', concept)).not.toHaveProperty('parentId');
  });
});

describe('newConcept', () => {
  const fields = conceptFields('Arriendo', RECURRENCE, []);

  it('creates an expense hanging from the given category', () => {
    expect(newConcept(fields, 10)).toEqual({ ...fields, kind: 'expense', parentId: 10 });
  });

  it('creates it without a parent when no category opened the sheet', () => {
    expect(newConcept(fields)).toEqual({ ...fields, kind: 'expense' });
  });
});
