import { Prisma } from '@prisma/client';

import {
  arbolDe,
  desglose,
  pendientesDelMes,
  recurrentesVivos,
  tendencia,
} from './dashboard.summary';
import { serializar } from '../../common/money/money';
import type { SummaryCategory } from '../categories/category-lookup.types';
import type { SummaryMovement } from '../transactions/ledger.types';

function makeCategory(overrides: Partial<SummaryCategory> & { id: bigint }): SummaryCategory {
  return {
    name: `Categoría ${overrides.id}`,
    color: null,
    icon: null,
    parentId: null,
    recurrente: false,
    periodicidad: null,
    diaDePago: null,
    mesDePago: null,
    presupuesto: null,
    pagoAutomatico: false,
    variosPagos: false,
    isArchived: false,
    ...overrides,
  };
}

function makeMovement(
  overrides: Omit<Partial<SummaryMovement>, 'amount' | 'date' | 'period'> & {
    amount?: string;
    date?: string;
    period?: string;
  } = {},
): SummaryMovement {
  const { amount = '1000', date = '2026-03-10', period, ...rest } = overrides;
  return {
    type: 'expense',
    categoryId: null,
    splits: [],
    ...rest,
    amount: new Prisma.Decimal(amount),
    date: new Date(date),
    period: new Date(period ?? `${date.slice(0, 7)}-01`),
  };
}

describe('tendencia', () => {
  it('snaps a payment outside a day axis to its nearest edge, so the line adds up', () => {
    const { granularidad, puntos } = tendencia(
      [
        makeMovement({ date: '2026-04-06', period: '2026-03-01', amount: '300' }),
        makeMovement({ date: '2026-02-27', period: '2026-03-01', amount: '200' }),
        makeMovement({ date: '2026-03-15', amount: '100' }),
        makeMovement({ type: 'transfer', date: '2026-03-15', amount: '999' }),
      ],
      new Date('2026-03-01'),
      new Date('2026-03-31'),
    );

    expect(granularidad).toBe('dia');
    expect(puntos[0]!.expense).toBe('200.00');
    expect(puntos[puntos.length - 1]!.expense).toBe('300.00');
    expect(puntos.reduce((n, p) => n + p.count, 0)).toBe(3);
  });
});

describe('desglose', () => {
  const tree = arbolDe([
    makeCategory({ id: 1n, name: 'Hogar' }),
    makeCategory({ id: 2n, name: 'Oficina' }),
  ]);

  it('splits a movement across the centers of its parts and keeps the unclassified apart', () => {
    const { porCentro } = desglose(
      [
        makeMovement({
          amount: '1000',
          categoryId: 1n,
          splits: [
            { categoryId: 1n, amount: new Prisma.Decimal('600') },
            { categoryId: 2n, amount: new Prisma.Decimal('400') },
          ],
        }),
        makeMovement({ amount: '50' }),
      ],
      tree,
      undefined,
    );

    const byName = Object.fromEntries(porCentro.map((r) => [r.name, r]));
    expect(Object.keys(byName).sort()).toEqual(['Hogar', 'Oficina', 'Sin clasificar']);
    expect(byName['Sin clasificar']).toMatchObject({ category_id: null, color: null });
  });
});

describe('pendientesDelMes', () => {
  it('leaves out a quarterly concept that is not due this month', () => {
    const quarterly = makeCategory({
      id: 3n,
      name: 'Predial',
      recurrente: true,
      periodicidad: 'trimestral',
      mesDePago: 1,
      diaDePago: 10,
      presupuesto: new Prisma.Decimal('90000'),
    });
    const result = pendientesDelMes(
      recurrentesVivos([quarterly]),
      { historiaDe: new Map(), pagadoEsteMes: new Map() },
      '2026-03',
      arbolDe([quarterly]),
    );
    expect(result.pendientes).toEqual([]);
    expect(serializar(result.presupuesto)).toBe('0.00');
  });
});
