import { serializar, toMoney } from '../../common/money/money';
import {
  calcularFlujo,
  calcularGastoPorCategoria,
  type MovimientoAgregable,
} from './dashboard.aggregate';

const mov = (
  type: MovimientoAgregable['type'],
  amount: string,
  categoryId: number | null = null,
  splits: { categoryId: number | null; amount: string }[] = [],
): MovimientoAgregable => ({
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
    const flujo = calcularFlujo([
      mov('income', '5200000'),
      mov('expense', '3180000'),
      mov('expense', '800000'),
    ]);

    expect(serializar(flujo.income)).toBe('5200000.00');
    expect(serializar(flujo.expense)).toBe('3980000.00');
    expect(serializar(flujo.net)).toBe('1220000.00');
  });

  it('EXCLUYE las transferencias: no son ingreso ni gasto', () => {
    const conTransferencias = calcularFlujo([
      mov('income', '1000000'),
      mov('expense', '400000'),
      mov('transfer', '300000'),
      mov('transfer', '300000'),
    ]);

    expect(serializar(conTransferencias.income)).toBe('1000000.00');
    expect(serializar(conTransferencias.expense)).toBe('400000.00');
    expect(serializar(conTransferencias.net)).toBe('600000.00');
  });

  it('un periodo sin movimientos da ceros, no NaN', () => {
    const flujo = calcularFlujo([]);
    expect(serializar(flujo.income)).toBe('0.00');
    expect(serializar(flujo.net)).toBe('0.00');
  });

  it('el neto puede ser negativo y se reporta tal cual', () => {
    const flujo = calcularFlujo([mov('income', '1000000'), mov('expense', '1500000')]);
    expect(serializar(flujo.net)).toBe('-500000.00');
  });
});

describe('Gasto por categoría', () => {
  it('agrupa por categoría y ordena de mayor a menor', () => {
    const resultado = calcularGastoPorCategoria([
      mov('expense', '100000', 1),
      mov('expense', '500000', 2),
      mov('expense', '50000', 1),
    ]);

    expect(resultado).toHaveLength(2);
    expect(resultado[0]!.category_id).toBe(BigInt(2));
    expect(serializar(resultado[0]!.total)).toBe('500000.00');
    expect(serializar(resultado[1]!.total)).toBe('150000.00');
    expect(resultado[1]!.count).toBe(2);
  });

  it('cuando hay splits, reparte por ellos y no por la categoría de cabecera', () => {
    // Una compra de 150.000 dividida entre mercado(5) y aseo(9).
    const resultado = calcularGastoPorCategoria([
      mov('expense', '150000', 5, [
        { categoryId: 5, amount: '105000' },
        { categoryId: 9, amount: '45000' },
      ]),
    ]);

    const mercado = resultado.find((fila) => fila.category_id === BigInt(5))!;
    const aseo = resultado.find((fila) => fila.category_id === BigInt(9))!;

    expect(serializar(mercado.total)).toBe('105000.00');
    expect(serializar(aseo.total)).toBe('45000.00');
    // Y no se contó 150.000 de más en la categoría de cabecera.
    expect(resultado).toHaveLength(2);
  });

  it('agrupa los movimientos sin categoría en vez de esconderlos', () => {
    const resultado = calcularGastoPorCategoria([
      mov('expense', '80000', null),
      mov('expense', '20000', null),
    ]);

    expect(resultado).toHaveLength(1);
    expect(resultado[0]!.category_id).toBeNull();
    expect(serializar(resultado[0]!.total)).toBe('100000.00');
  });

  it('ignora ingresos y transferencias', () => {
    const resultado = calcularGastoPorCategoria([
      mov('income', '5000000', 1),
      mov('transfer', '300000', 1),
      mov('expense', '100000', 1),
    ]);

    expect(resultado).toHaveLength(1);
    expect(serializar(resultado[0]!.total)).toBe('100000.00');
  });

  it('el total por categoría cuadra con el gasto total del flujo', () => {
    const movimientos = [
      mov('expense', '150000', 5, [
        { categoryId: 5, amount: '105000' },
        { categoryId: 9, amount: '45000' },
      ]),
      mov('expense', '89900', 12),
      mov('expense', '30000', null),
      mov('income', '5000000', 1),
    ];

    const flujo = calcularFlujo(movimientos);
    const porCategoria = calcularGastoPorCategoria(movimientos);
    const sumaPorCategoria = porCategoria.reduce(
      (total, fila) => total.plus(fila.total),
      toMoney(0),
    );

    // Si estas dos cifras no coinciden, el dashboard estaría mintiendo.
    expect(serializar(sumaPorCategoria)).toBe(serializar(flujo.expense));
  });
});
