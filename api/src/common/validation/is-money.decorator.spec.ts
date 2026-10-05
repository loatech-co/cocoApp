import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { IsMoney, IsPositiveMoney } from './is-money.decorator';

class WithMoney {
  @IsMoney()
  amount!: unknown;
}

class WithPositiveMoney {
  @IsPositiveMoney({ message: 'custom' })
  amount!: unknown;
}

function errorsOf(cls: new () => object, amount: unknown): string[] {
  const [error] = validateSync(plainToInstance(cls, { amount }));
  return Object.values(error?.constraints ?? {});
}

describe('IsMoney', () => {
  it.each(['150000', '0.5', '-20', 89900, '0'])('accepts %p', (amount) => {
    expect(errorsOf(WithMoney, amount)).toEqual([]);
  });

  it('rejects a value that is neither a string nor a number', () => {
    expect(errorsOf(WithMoney, true)).toEqual(['amount debe ser un monto (string o número).']);
    expect(errorsOf(WithMoney, null)).toHaveLength(1);
  });

  it('rejects text that is not a decimal', () => {
    expect(errorsOf(WithMoney, 'doce mil')).toEqual(['amount no es un monto válido.']);
  });

  it('explains why a decimal is out of bounds', () => {
    expect(errorsOf(WithMoney, '10000000000000')[0]).toMatch(/excede/i);
    expect(errorsOf(WithMoney, '10.005')[0]).toMatch(/decimales/i);
  });
});

describe('IsPositiveMoney', () => {
  it('accepts an amount above zero', () => {
    expect(errorsOf(WithPositiveMoney, '0.01')).toEqual([]);
  });

  it.each([0, '-1', 'abc', {}, '10000000000000'])('rejects %p', (amount) => {
    expect(errorsOf(WithPositiveMoney, amount)).toEqual(['custom']);
  });

  it('names the field in its default message', () => {
    class Bare {
      @IsPositiveMoney()
      total!: unknown;
    }
    const [error] = validateSync(plainToInstance(Bare, { total: 0 }));
    expect(error?.constraints).toEqual({
      isPositiveMoney: 'total debe ser un monto mayor que cero.',
    });
  });
});
