import {
  ancestroEnNivel,
  calcularFlujo,
  calcularGastoPorCategoria,
  cubosDelRango,
  diasDelRango,
  granularidadPara,
  type MovimientoAgregable,
} from './dashboard.aggregate';
import { serialize, toMoney } from '../../common/money/money';

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

    expect(serialize(flujo.income)).toBe('5200000.00');
    expect(serialize(flujo.expense)).toBe('3980000.00');
    expect(serialize(flujo.net)).toBe('1220000.00');
  });

  it('EXCLUYE las transferencias: no son ingreso ni gasto', () => {
    const conTransferencias = calcularFlujo([
      mov('income', '1000000'),
      mov('expense', '400000'),
      mov('transfer', '300000'),
      mov('transfer', '300000'),
    ]);

    expect(serialize(conTransferencias.income)).toBe('1000000.00');
    expect(serialize(conTransferencias.expense)).toBe('400000.00');
    expect(serialize(conTransferencias.net)).toBe('600000.00');
  });

  it('un periodo sin movimientos da ceros, no NaN', () => {
    const flujo = calcularFlujo([]);
    expect(serialize(flujo.income)).toBe('0.00');
    expect(serialize(flujo.net)).toBe('0.00');
  });

  it('el neto puede ser negativo y se reporta tal cual', () => {
    const flujo = calcularFlujo([mov('income', '1000000'), mov('expense', '1500000')]);
    expect(serialize(flujo.net)).toBe('-500000.00');
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
    expect(serialize(resultado[0]!.total)).toBe('500000.00');
    expect(serialize(resultado[1]!.total)).toBe('150000.00');
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

    expect(serialize(mercado.total)).toBe('105000.00');
    expect(serialize(aseo.total)).toBe('45000.00');
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
    expect(serialize(resultado[0]!.total)).toBe('100000.00');
  });

  it('ignora ingresos y transferencias', () => {
    const resultado = calcularGastoPorCategoria([
      mov('income', '5000000', 1),
      mov('transfer', '300000', 1),
      mov('expense', '100000', 1),
    ]);

    expect(resultado).toHaveLength(1);
    expect(serialize(resultado[0]!.total)).toBe('100000.00');
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
    expect(serialize(sumaPorCategoria)).toBe(serialize(flujo.expense));
  });
});

describe('Jerarquía de tres niveles', () => {
  // Costos fijos(1) → Servicios públicos(2) → Celsia(3)
  const arbol = new Map([
    ['1', { id: BigInt(1), parentId: null }],
    ['2', { id: BigInt(2), parentId: BigInt(1) }],
    ['3', { id: BigInt(3), parentId: BigInt(2) }],
  ]);

  it('sube de un concepto a su centro de costos', () => {
    expect(ancestroEnNivel(arbol, BigInt(3), 1)).toBe(BigInt(1));
  });

  it('sube de un concepto a su categoría', () => {
    expect(ancestroEnNivel(arbol, BigInt(3), 2)).toBe(BigInt(2));
  });

  it('un concepto pedido a su propio nivel se devuelve a sí mismo', () => {
    expect(ancestroEnNivel(arbol, BigInt(3), 3)).toBe(BigInt(3));
  });

  it('un centro no tiene nivel 2: devuelve null en vez de inventarlo', () => {
    expect(ancestroEnNivel(arbol, BigInt(1), 2)).toBeNull();
  });

  it('sin categoría no hay ancestro', () => {
    expect(ancestroEnNivel(arbol, null, 1)).toBeNull();
  });

  it('un ciclo no cuelga el proceso', () => {
    const ciclo = new Map([
      ['1', { id: BigInt(1), parentId: BigInt(2) }],
      ['2', { id: BigInt(2), parentId: BigInt(1) }],
    ]);
    expect(() => ancestroEnNivel(ciclo, BigInt(1), 1)).not.toThrow();
  });
});

describe('Tendencia', () => {
  const d = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

  it('un rango corto se agrupa por día', () => {
    expect(granularidadPara(d('2025-03-01'), d('2025-03-31'))).toBe('dia');
  });

  it('un rango largo se agrupa por mes: 365 puntos no son una tendencia', () => {
    expect(granularidadPara(d('2025-01-01'), d('2025-12-31'))).toBe('mes');
  });

  it('dos meses siguen siendo días', () => {
    expect(granularidadPara(d('2025-03-01'), d('2025-04-30'))).toBe('dia');
  });

  it('"los ultimos 3 meses" se agrupa por mes SIEMPRE, caiga en el mes que caiga', () => {
    // Contando días esto no era estable: feb-abr son 61 días y may-jul son 92,
    // así que el mismo botón cambiaba la unidad del eje según el mes.
    expect(granularidadPara(d('2025-02-01'), d('2025-04-02'))).toBe('mes');
    expect(granularidadPara(d('2025-05-01'), d('2025-07-02'))).toBe('mes');
  });

  it('incluye los cubos VACÍOS: un mes en blanco tiene que verse plano', () => {
    const cubos = cubosDelRango(d('2025-01-01'), d('2025-03-31'), 'mes');
    expect(cubos).toEqual(['2025-01', '2025-02', '2025-03']);
  });

  it('el último día del rango entra', () => {
    const cubos = cubosDelRango(d('2025-03-01'), d('2025-03-03'), 'dia');
    expect(cubos).toEqual(['2025-03-01', '2025-03-02', '2025-03-03']);
  });

  it('cuenta ambos extremos del rango', () => {
    expect(diasDelRango(d('2025-03-01'), d('2025-03-01'))).toBe(1);
    expect(diasDelRango(d('2025-03-01'), d('2025-03-31'))).toBe(31);
  });
});
