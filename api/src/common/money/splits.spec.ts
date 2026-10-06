import { serialize, toMoney } from './money';
import { checkSplitsReconcile } from './splits';

describe('Cuadre de splits', () => {
  it('cuadra cuando la suma iguala exactamente el monto', () => {
    const result = checkSplitsReconcile(toMoney('150000'), [toMoney('105000'), toMoney('45000')]);

    expect(result.balances).toBe(true);
    expect(serialize(result.total)).toBe('150000.00');
    expect(serialize(result.difference)).toBe('0.00');
  });

  it('no cuadra por un solo centavo — en dinero no existe "casi igual"', () => {
    const result = checkSplitsReconcile(toMoney('150000.00'), [
      toMoney('105000.00'),
      toMoney('45000.01'),
    ]);

    expect(result.balances).toBe(false);
    expect(serialize(result.difference)).toBe('0.01');
  });

  it('informa cuánto falta para que la UI pueda ofrecer "ajustar al restante"', () => {
    const result = checkSplitsReconcile(toMoney('150000'), [toMoney('105000')]);

    expect(result.balances).toBe(false);
    expect(serialize(result.difference)).toBe('-45000.00');
  });

  it('detecta cuando los splits se pasan del total', () => {
    const result = checkSplitsReconcile(toMoney('150000'), [toMoney('105000'), toMoney('60000')]);

    expect(result.balances).toBe(false);
    expect(serialize(result.difference)).toBe('15000.00');
  });

  it('cuadra con divisiones que dan decimales', () => {
    // 100.000 repartido en tres partes: 33.333,33 + 33.333,33 + 33.333,34
    const result = checkSplitsReconcile(toMoney('100000'), [
      toMoney('33333.33'),
      toMoney('33333.33'),
      toMoney('33333.34'),
    ]);

    expect(result.balances).toBe(true);
  });

  it('un movimiento sin splits no cuadra contra un monto positivo', () => {
    const result = checkSplitsReconcile(toMoney('150000'), []);

    expect(result.balances).toBe(false);
    expect(serialize(result.total)).toBe('0.00');
  });

  it('acumula muchos splits pequeños sin desviarse', () => {
    const splits = Array.from({ length: 100 }, () => toMoney('0.07'));
    const result = checkSplitsReconcile(toMoney('7.00'), splits);

    expect(result.balances).toBe(true);
    expect(serialize(result.total)).toBe('7.00');
  });
});
