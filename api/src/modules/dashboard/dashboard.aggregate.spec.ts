import {
  ancestorAtLevel,
  computeFlow,
  computeExpenseByCategory,
  rangeBuckets,
  daysInRange,
  granularityFor,
  type AggregableMovement,
} from './dashboard.aggregate';
import { serialize, toMoney } from '../../common/money/money';

const movement = (
  type: AggregableMovement['type'],
  amount: string,
  categoryId: number | null = null,
  splits: { categoryId: number | null; amount: string }[] = [],
): AggregableMovement => ({
  type,
  amount: toMoney(amount),
  categoryId: categoryId === null ? null : BigInt(categoryId),
  splits: splits.map((split) => ({
    categoryId: split.categoryId === null ? null : BigInt(split.categoryId),
    amount: toMoney(split.amount),
  })),
});

describe('Flujo del periodo', () => {
  it('suma ingresos y gastos por separado y calcula el neto', () => {
    const flow = computeFlow([
      movement('income', '5200000'),
      movement('expense', '3180000'),
      movement('expense', '800000'),
    ]);

    expect(serialize(flow.income)).toBe('5200000.00');
    expect(serialize(flow.expense)).toBe('3980000.00');
    expect(serialize(flow.net)).toBe('1220000.00');
  });

  it('EXCLUYE las transferencias: no son ingreso ni gasto', () => {
    const withTransfers = computeFlow([
      movement('income', '1000000'),
      movement('expense', '400000'),
      movement('transfer', '300000'),
      movement('transfer', '300000'),
    ]);

    expect(serialize(withTransfers.income)).toBe('1000000.00');
    expect(serialize(withTransfers.expense)).toBe('400000.00');
    expect(serialize(withTransfers.net)).toBe('600000.00');
  });

  it('un periodo sin movimientos da ceros, no NaN', () => {
    const flow = computeFlow([]);
    expect(serialize(flow.income)).toBe('0.00');
    expect(serialize(flow.net)).toBe('0.00');
  });

  it('el neto puede ser negativo y se reporta tal cual', () => {
    const flow = computeFlow([movement('income', '1000000'), movement('expense', '1500000')]);
    expect(serialize(flow.net)).toBe('-500000.00');
  });
});

describe('Gasto por categoría', () => {
  it('agrupa por categoría y ordena de mayor a menor', () => {
    const result = computeExpenseByCategory([
      movement('expense', '100000', 1),
      movement('expense', '500000', 2),
      movement('expense', '50000', 1),
    ]);

    expect(result).toHaveLength(2);
    expect(result[0]!.category_id).toBe(BigInt(2));
    expect(serialize(result[0]!.total)).toBe('500000.00');
    expect(serialize(result[1]!.total)).toBe('150000.00');
    expect(result[1]!.count).toBe(2);
  });

  it('cuando hay splits, reparte por ellos y no por la categoría de cabecera', () => {
    // Una compra de 150.000 dividida entre mercado(5) y aseo(9).
    const result = computeExpenseByCategory([
      movement('expense', '150000', 5, [
        { categoryId: 5, amount: '105000' },
        { categoryId: 9, amount: '45000' },
      ]),
    ]);

    const groceries = result.find((row) => row.category_id === BigInt(5))!;
    const cleaning = result.find((row) => row.category_id === BigInt(9))!;

    expect(serialize(groceries.total)).toBe('105000.00');
    expect(serialize(cleaning.total)).toBe('45000.00');
    // Y no se contó 150.000 de más en la categoría de cabecera.
    expect(result).toHaveLength(2);
  });

  it('agrupa los movimientos sin categoría en vez de esconderlos', () => {
    const result = computeExpenseByCategory([
      movement('expense', '80000', null),
      movement('expense', '20000', null),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]!.category_id).toBeNull();
    expect(serialize(result[0]!.total)).toBe('100000.00');
  });

  it('ignora ingresos y transferencias', () => {
    const result = computeExpenseByCategory([
      movement('income', '5000000', 1),
      movement('transfer', '300000', 1),
      movement('expense', '100000', 1),
    ]);

    expect(result).toHaveLength(1);
    expect(serialize(result[0]!.total)).toBe('100000.00');
  });

  it('el total por categoría cuadra con el gasto total del flujo', () => {
    const movements = [
      movement('expense', '150000', 5, [
        { categoryId: 5, amount: '105000' },
        { categoryId: 9, amount: '45000' },
      ]),
      movement('expense', '89900', 12),
      movement('expense', '30000', null),
      movement('income', '5000000', 1),
    ];

    const flow = computeFlow(movements);
    const byCategory = computeExpenseByCategory(movements);
    const sumByCategory = byCategory.reduce((total, row) => total.plus(row.total), toMoney(0));

    // Si estas dos cifras no coinciden, el dashboard estaría mintiendo.
    expect(serialize(sumByCategory)).toBe(serialize(flow.expense));
  });
});

describe('Jerarquía de tres niveles', () => {
  // Costos fijos(1) → Servicios públicos(2) → Celsia(3)
  const tree = new Map([
    ['1', { id: BigInt(1), parentId: null }],
    ['2', { id: BigInt(2), parentId: BigInt(1) }],
    ['3', { id: BigInt(3), parentId: BigInt(2) }],
  ]);

  it('sube de un concepto a su centro de costos', () => {
    expect(ancestorAtLevel(tree, BigInt(3), 1)).toBe(BigInt(1));
  });

  it('sube de un concepto a su categoría', () => {
    expect(ancestorAtLevel(tree, BigInt(3), 2)).toBe(BigInt(2));
  });

  it('un concepto pedido a su propio nivel se devuelve a sí mismo', () => {
    expect(ancestorAtLevel(tree, BigInt(3), 3)).toBe(BigInt(3));
  });

  it('un centro no tiene nivel 2: devuelve null en vez de inventarlo', () => {
    expect(ancestorAtLevel(tree, BigInt(1), 2)).toBeNull();
  });

  it('sin categoría no hay ancestro', () => {
    expect(ancestorAtLevel(tree, null, 1)).toBeNull();
  });

  it('un ciclo no cuelga el proceso', () => {
    const cycle = new Map([
      ['1', { id: BigInt(1), parentId: BigInt(2) }],
      ['2', { id: BigInt(2), parentId: BigInt(1) }],
    ]);
    expect(() => ancestorAtLevel(cycle, BigInt(1), 1)).not.toThrow();
  });
});

describe('Tendencia', () => {
  const d = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

  it('un rango corto se agrupa por día', () => {
    expect(granularityFor(d('2025-03-01'), d('2025-03-31'))).toBe('day');
  });

  it('un rango largo se agrupa por mes: 365 puntos no son una tendencia', () => {
    expect(granularityFor(d('2025-01-01'), d('2025-12-31'))).toBe('month');
  });

  it('dos meses siguen siendo días', () => {
    expect(granularityFor(d('2025-03-01'), d('2025-04-30'))).toBe('day');
  });

  it('"los ultimos 3 meses" se agrupa por mes SIEMPRE, caiga en el mes que caiga', () => {
    // Contando días esto no era estable: feb-abr son 61 días y may-jul son 92,
    // así que el mismo botón cambiaba la unidad del eje según el mes.
    expect(granularityFor(d('2025-02-01'), d('2025-04-02'))).toBe('month');
    expect(granularityFor(d('2025-05-01'), d('2025-07-02'))).toBe('month');
  });

  it('incluye los cubos VACÍOS: un mes en blanco tiene que verse plano', () => {
    const buckets = rangeBuckets(d('2025-01-01'), d('2025-03-31'), 'month');
    expect(buckets).toEqual(['2025-01', '2025-02', '2025-03']);
  });

  it('el último día del rango entra', () => {
    const buckets = rangeBuckets(d('2025-03-01'), d('2025-03-03'), 'day');
    expect(buckets).toEqual(['2025-03-01', '2025-03-02', '2025-03-03']);
  });

  it('cuenta ambos extremos del rango', () => {
    expect(daysInRange(d('2025-03-01'), d('2025-03-01'))).toBe(1);
    expect(daysInRange(d('2025-03-01'), d('2025-03-31'))).toBe(31);
  });
});
