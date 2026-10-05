import { calcularCupoDisponible, calcularSaldo, type MovimientoDeSaldo } from './balance';
import { serializar, toMoney } from './money';
import type { AccountType } from '../../generated/prisma/client';

/** Atajos para que las tablas de casos se lean como el enunciado del PRD. */
const ingreso = (monto: string, status: 'cleared' | 'pending' = 'cleared'): MovimientoDeSaldo => ({
  type: 'income',
  transferDir: null,
  amount: toMoney(monto),
  status,
});

const gasto = (monto: string, status: 'cleared' | 'pending' = 'cleared'): MovimientoDeSaldo => ({
  type: 'expense',
  transferDir: null,
  amount: toMoney(monto),
  status,
});

const transferenciaSale = (monto: string): MovimientoDeSaldo => ({
  type: 'transfer',
  transferDir: 'out',
  amount: toMoney(monto),
  status: 'cleared',
});

const transferenciaEntra = (monto: string): MovimientoDeSaldo => ({
  type: 'transfer',
  transferDir: 'in',
  amount: toMoney(monto),
  status: 'cleared',
});

const saldoDe = (
  tipo: AccountType,
  opening: string,
  movimientos: MovimientoDeSaldo[],
): { cleared: string; proyectado: string } => {
  const resultado = calcularSaldo(tipo, toMoney(opening), movimientos);
  return {
    cleared: serializar(resultado.cleared),
    proyectado: serializar(resultado.proyectado),
  };
};

describe('Saldo derivado — cuentas de activo', () => {
  it('S1 · sin saldo inicial: +500.000 ingreso, −120.000 gasto → 380.000', () => {
    expect(saldoDe('debit', '0.00', [ingreso('500000'), gasto('120000')]).cleared).toBe(
      '380000.00',
    );
  });

  it('S2 · con saldo inicial: 1.000.000 −250.000 −250.000 +100.000 → 600.000', () => {
    expect(
      saldoDe('bank', '1000000.00', [gasto('250000'), gasto('250000'), ingreso('100000')]).cleared,
    ).toBe('600000.00');
  });

  it('S3 · una transferencia que sale resta del origen', () => {
    expect(saldoDe('savings', '0.00', [transferenciaSale('300000')]).cleared).toBe('-300000.00');
  });

  it('S4 · una transferencia que entra suma al destino', () => {
    expect(saldoDe('cash', '0.00', [transferenciaEntra('300000')]).cleared).toBe('300000.00');
  });

  it('la transferencia no altera el patrimonio: las dos patas suman cero', () => {
    const origen = calcularSaldo('bank', toMoney('1000000'), [transferenciaSale('300000')]);
    const destino = calcularSaldo('savings', toMoney('0'), [transferenciaEntra('300000')]);

    const total = origen.cleared.plus(destino.cleared);
    expect(serializar(total)).toBe('1000000.00');
  });

  it('caso del PRD: opening 500.000, +1.000.000, −300.000 → 1.200.000', () => {
    expect(saldoDe('debit', '500000.00', [ingreso('1000000'), gasto('300000')]).cleared).toBe(
      '1200000.00',
    );
  });

  it('mantiene la exactitud al centavo con montos de muchos dígitos', () => {
    expect(
      saldoDe('debit', '0.00', [ingreso('195466.67'), gasto('89900.33'), ingreso('0.01')]).cleared,
    ).toBe('105566.35');
  });

  it('sin movimientos, el saldo es el de apertura', () => {
    expect(saldoDe('cash', '250000.00', []).cleared).toBe('250000.00');
  });
});

describe('Saldo derivado — pendientes', () => {
  it('S5 · un gasto pending no toca el saldo cleared pero sí el proyectado', () => {
    const saldo = saldoDe('debit', '0.00', [gasto('50000', 'pending')]);

    expect(saldo.cleared).toBe('0.00');
    expect(saldo.proyectado).toBe('-50000.00');
  });

  it('caso del PRD: sumar un gasto pending deja el cleared intacto', () => {
    const movimientos = [ingreso('1000000'), gasto('300000'), gasto('100000', 'pending')];
    const saldo = saldoDe('debit', '500000.00', movimientos);

    expect(saldo.cleared).toBe('1200000.00');
    expect(saldo.proyectado).toBe('1100000.00');
  });
});

describe('Saldo derivado — tarjetas de crédito (pasivo)', () => {
  it('el saldo representa DEUDA: un consumo la aumenta', () => {
    expect(saldoDe('credit', '0.00', [gasto('430000')]).cleared).toBe('430000.00');
  });

  it('una transferencia que entra a la tarjeta es un pago: reduce la deuda', () => {
    expect(saldoDe('credit', '1000000.00', [transferenciaEntra('400000')]).cleared).toBe(
      '600000.00',
    );
  });

  it('un ingreso a la tarjeta (una devolución) también reduce la deuda', () => {
    expect(saldoDe('credit', '500000.00', [ingreso('80000')]).cleared).toBe('420000.00');
  });

  it('consumir y pagar en el mismo periodo deja el neto correcto', () => {
    const saldo = saldoDe('credit', '0.00', [
      gasto('1200000'),
      gasto('300000'),
      transferenciaEntra('1000000'),
    ]);
    expect(saldo.cleared).toBe('500000.00');
  });

  it('invierte el signo respecto a una cuenta de activo con los mismos movimientos', () => {
    const movimientos = [gasto('100000'), ingreso('30000')];

    expect(saldoDe('debit', '0.00', movimientos).cleared).toBe('-70000.00');
    expect(saldoDe('credit', '0.00', movimientos).cleared).toBe('70000.00');
  });
});

describe('Cupo disponible', () => {
  it('es el cupo menos lo adeudado', () => {
    const disponible = calcularCupoDisponible(toMoney('5000000'), toMoney('1240000'));
    expect(serializar(disponible!)).toBe('3760000.00');
  });

  it('queda negativo si se excedió el cupo — se informa, no se bloquea', () => {
    const disponible = calcularCupoDisponible(toMoney('1000000'), toMoney('1150000'));
    expect(serializar(disponible!)).toBe('-150000.00');
  });

  it('es null cuando la cuenta no tiene cupo definido', () => {
    expect(calcularCupoDisponible(null, toMoney('500000'))).toBeNull();
  });
});

describe('Saldo derivado — datos incompletos', () => {
  it('una transferencia sin dirección aporta cero en vez de inventar un signo', () => {
    const corrupta: MovimientoDeSaldo = {
      type: 'transfer',
      transferDir: null,
      amount: toMoney('300000'),
      status: 'cleared',
    };

    expect(saldoDe('debit', '100000.00', [corrupta]).cleared).toBe('100000.00');
  });
});
