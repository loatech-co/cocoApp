import { ZERO, isPositive, rejectionReason, serialize, areEqual, sum, toMoney } from './money';
import { Prisma } from '../../generated/prisma/client';

describe('Money — aritmética exacta', () => {
  it('no arrastra el error de coma flotante que sí tiene `number`', () => {
    // La razón de existir de todo este módulo.
    expect(0.1 + 0.2).not.toBe(0.3);

    const result = toMoney('0.10').plus(toMoney('0.20'));
    expect(areEqual(result, toMoney('0.30'))).toBe(true);
    expect(serialize(result)).toBe('0.30');
  });

  it('suma cientos de movimientos sin perder un centavo', () => {
    // 1000 × 0.01 debe dar exactamente 10.00
    const amounts = Array.from({ length: 1000 }, () => toMoney('0.01'));
    expect(serialize(sum(amounts))).toBe('10.00');
  });

  it('suma montos realistas en COP sin desviarse', () => {
    const amounts = ['1250000.00', '89900.00', '32000.50', '195466.67'].map(toMoney);
    expect(serialize(sum(amounts))).toBe('1567367.17');
  });

  it('la suma de una lista vacía es cero, no NaN', () => {
    expect(serialize(sum([]))).toBe('0.00');
    expect(areEqual(sum([]), ZERO)).toBe(true);
  });

  it('normaliza a 2 decimales con redondeo half-up', () => {
    expect(serialize(toMoney('0.005'))).toBe('0.01');
    expect(serialize(toMoney('0.004'))).toBe('0.00');
    expect(serialize(toMoney('195466.666'))).toBe('195466.67');
    expect(serialize(toMoney('195466.664'))).toBe('195466.66');
  });

  it('serializa siempre con 2 decimales, aunque sean .00', () => {
    expect(serialize(toMoney(45000))).toBe('45000.00');
    expect(serialize(toMoney('1250000'))).toBe('1250000.00');
    expect(serialize(ZERO)).toBe('0.00');
  });

  it('acepta string, number y Decimal como entrada', () => {
    const fromString = toMoney('89900.00');
    const fromNumber = toMoney(89900);
    const fromDecimal = toMoney(new Prisma.Decimal('89900'));

    expect(areEqual(fromString, fromNumber)).toBe(true);
    expect(areEqual(fromNumber, fromDecimal)).toBe(true);
  });

  describe('validación de entrada', () => {
    it('acepta montos representables en DECIMAL(15,2)', () => {
      expect(rejectionReason(toMoney('9999999999999.99'))).toBeNull();
      expect(rejectionReason(toMoney('0.01'))).toBeNull();
      expect(rejectionReason(ZERO)).toBeNull();
    });

    it('rechaza más de 2 decimales sin normalizar en silencio', () => {
      // Ojo: se evalúa el Decimal crudo, no el ya normalizado por toMoney.
      const raw = new Prisma.Decimal('10.005');
      expect(rejectionReason(raw)).toMatch(/decimales/i);
    });

    it('rechaza montos que desbordan la escala del esquema', () => {
      expect(rejectionReason(new Prisma.Decimal('10000000000000'))).toMatch(/excede/i);
    });

    it('rechaza valores no finitos', () => {
      expect(rejectionReason(new Prisma.Decimal(Infinity))).toMatch(/no es un número/i);
    });
  });

  it('distingue positivo de cero', () => {
    expect(isPositive(toMoney('0.01'))).toBe(true);
    expect(isPositive(ZERO)).toBe(false);
    expect(isPositive(toMoney('-0.01'))).toBe(false);
  });
});
