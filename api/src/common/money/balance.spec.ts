import { computeAvailableCredit, computeBalance, type BalanceMovement } from './balance';
import { serialize, toMoney } from './money';
import type { AccountType } from '../../generated/prisma/client';

/** Atajos para que las tablas de casos se lean como el enunciado del PRD. */
const income = (amount: string, status: 'cleared' | 'pending' = 'cleared'): BalanceMovement => ({
  type: 'income',
  transferDir: null,
  amount: toMoney(amount),
  status,
});

const expense = (amount: string, status: 'cleared' | 'pending' = 'cleared'): BalanceMovement => ({
  type: 'expense',
  transferDir: null,
  amount: toMoney(amount),
  status,
});

const transferOut = (amount: string): BalanceMovement => ({
  type: 'transfer',
  transferDir: 'out',
  amount: toMoney(amount),
  status: 'cleared',
});

const transferIn = (amount: string): BalanceMovement => ({
  type: 'transfer',
  transferDir: 'in',
  amount: toMoney(amount),
  status: 'cleared',
});

const balanceOf = (
  type: AccountType,
  opening: string,
  movements: BalanceMovement[],
): { cleared: string; projected: string } => {
  const result = computeBalance(type, toMoney(opening), movements);
  return {
    cleared: serialize(result.cleared),
    projected: serialize(result.projected),
  };
};

describe('Saldo derivado — cuentas de activo', () => {
  it('S1 · sin saldo inicial: +500.000 ingreso, −120.000 gasto → 380.000', () => {
    expect(balanceOf('debit', '0.00', [income('500000'), expense('120000')]).cleared).toBe(
      '380000.00',
    );
  });

  it('S2 · con saldo inicial: 1.000.000 −250.000 −250.000 +100.000 → 600.000', () => {
    expect(
      balanceOf('bank', '1000000.00', [expense('250000'), expense('250000'), income('100000')])
        .cleared,
    ).toBe('600000.00');
  });

  it('S3 · una transferencia que sale resta del origen', () => {
    expect(balanceOf('savings', '0.00', [transferOut('300000')]).cleared).toBe('-300000.00');
  });

  it('S4 · una transferencia que entra suma al destino', () => {
    expect(balanceOf('cash', '0.00', [transferIn('300000')]).cleared).toBe('300000.00');
  });

  it('la transferencia no altera el patrimonio: las dos patas suman cero', () => {
    const source = computeBalance('bank', toMoney('1000000'), [transferOut('300000')]);
    const target = computeBalance('savings', toMoney('0'), [transferIn('300000')]);

    const total = source.cleared.plus(target.cleared);
    expect(serialize(total)).toBe('1000000.00');
  });

  it('caso del PRD: opening 500.000, +1.000.000, −300.000 → 1.200.000', () => {
    expect(balanceOf('debit', '500000.00', [income('1000000'), expense('300000')]).cleared).toBe(
      '1200000.00',
    );
  });

  it('mantiene la exactitud al centavo con montos de muchos dígitos', () => {
    expect(
      balanceOf('debit', '0.00', [income('195466.67'), expense('89900.33'), income('0.01')])
        .cleared,
    ).toBe('105566.35');
  });

  it('sin movimientos, el saldo es el de apertura', () => {
    expect(balanceOf('cash', '250000.00', []).cleared).toBe('250000.00');
  });
});

describe('Saldo derivado — pendientes', () => {
  it('S5 · un gasto pending no toca el saldo cleared pero sí el proyectado', () => {
    const balance = balanceOf('debit', '0.00', [expense('50000', 'pending')]);

    expect(balance.cleared).toBe('0.00');
    expect(balance.projected).toBe('-50000.00');
  });

  it('caso del PRD: sumar un gasto pending deja el cleared intacto', () => {
    const movements = [income('1000000'), expense('300000'), expense('100000', 'pending')];
    const balance = balanceOf('debit', '500000.00', movements);

    expect(balance.cleared).toBe('1200000.00');
    expect(balance.projected).toBe('1100000.00');
  });
});

describe('Saldo derivado — tarjetas de crédito (pasivo)', () => {
  it('el saldo representa DEUDA: un consumo la aumenta', () => {
    expect(balanceOf('credit', '0.00', [expense('430000')]).cleared).toBe('430000.00');
  });

  it('una transferencia que entra a la tarjeta es un pago: reduce la deuda', () => {
    expect(balanceOf('credit', '1000000.00', [transferIn('400000')]).cleared).toBe('600000.00');
  });

  it('un ingreso a la tarjeta (una devolución) también reduce la deuda', () => {
    expect(balanceOf('credit', '500000.00', [income('80000')]).cleared).toBe('420000.00');
  });

  it('consumir y pagar en el mismo periodo deja el neto correcto', () => {
    const balance = balanceOf('credit', '0.00', [
      expense('1200000'),
      expense('300000'),
      transferIn('1000000'),
    ]);
    expect(balance.cleared).toBe('500000.00');
  });

  it('invierte el signo respecto a una cuenta de activo con los mismos movimientos', () => {
    const movements = [expense('100000'), income('30000')];

    expect(balanceOf('debit', '0.00', movements).cleared).toBe('-70000.00');
    expect(balanceOf('credit', '0.00', movements).cleared).toBe('70000.00');
  });
});

describe('Cupo disponible', () => {
  it('es el cupo menos lo adeudado', () => {
    const available = computeAvailableCredit(toMoney('5000000'), toMoney('1240000'));
    expect(serialize(available!)).toBe('3760000.00');
  });

  it('queda negativo si se excedió el cupo — se informa, no se bloquea', () => {
    const available = computeAvailableCredit(toMoney('1000000'), toMoney('1150000'));
    expect(serialize(available!)).toBe('-150000.00');
  });

  it('es null cuando la cuenta no tiene cupo definido', () => {
    expect(computeAvailableCredit(null, toMoney('500000'))).toBeNull();
  });
});

describe('Saldo derivado — datos incompletos', () => {
  it('una transferencia sin dirección aporta cero en vez de inventar un signo', () => {
    const corrupt: BalanceMovement = {
      type: 'transfer',
      transferDir: null,
      amount: toMoney('300000'),
      status: 'cleared',
    };

    expect(balanceOf('debit', '100000.00', [corrupt]).cleared).toBe('100000.00');
  });
});
