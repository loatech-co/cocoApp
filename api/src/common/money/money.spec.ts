import { Prisma } from '@prisma/client';
import { CERO, esPositivo, motivoDeRechazo, serializar, sonIguales, sumar, toMoney } from './money';

describe('Money — aritmética exacta', () => {
  it('no arrastra el error de coma flotante que sí tiene `number`', () => {
    // La razón de existir de todo este módulo.
    expect(0.1 + 0.2).not.toBe(0.3);

    const resultado = toMoney('0.10').plus(toMoney('0.20'));
    expect(sonIguales(resultado, toMoney('0.30'))).toBe(true);
    expect(serializar(resultado)).toBe('0.30');
  });

  it('suma cientos de movimientos sin perder un centavo', () => {
    // 1000 × 0.01 debe dar exactamente 10.00
    const montos = Array.from({ length: 1000 }, () => toMoney('0.01'));
    expect(serializar(sumar(montos))).toBe('10.00');
  });

  it('suma montos realistas en COP sin desviarse', () => {
    const montos = ['1250000.00', '89900.00', '32000.50', '195466.67'].map(toMoney);
    expect(serializar(sumar(montos))).toBe('1567367.17');
  });

  it('la suma de una lista vacía es cero, no NaN', () => {
    expect(serializar(sumar([]))).toBe('0.00');
    expect(sonIguales(sumar([]), CERO)).toBe(true);
  });

  it('normaliza a 2 decimales con redondeo half-up', () => {
    expect(serializar(toMoney('0.005'))).toBe('0.01');
    expect(serializar(toMoney('0.004'))).toBe('0.00');
    expect(serializar(toMoney('195466.666'))).toBe('195466.67');
    expect(serializar(toMoney('195466.664'))).toBe('195466.66');
  });

  it('serializa siempre con 2 decimales, aunque sean .00', () => {
    expect(serializar(toMoney(45000))).toBe('45000.00');
    expect(serializar(toMoney('1250000'))).toBe('1250000.00');
    expect(serializar(CERO)).toBe('0.00');
  });

  it('acepta string, number y Decimal como entrada', () => {
    const desdeString = toMoney('89900.00');
    const desdeNumero = toMoney(89900);
    const desdeDecimal = toMoney(new Prisma.Decimal('89900'));

    expect(sonIguales(desdeString, desdeNumero)).toBe(true);
    expect(sonIguales(desdeNumero, desdeDecimal)).toBe(true);
  });

  describe('validación de entrada', () => {
    it('acepta montos representables en DECIMAL(15,2)', () => {
      expect(motivoDeRechazo(toMoney('9999999999999.99'))).toBeNull();
      expect(motivoDeRechazo(toMoney('0.01'))).toBeNull();
      expect(motivoDeRechazo(CERO)).toBeNull();
    });

    it('rechaza más de 2 decimales sin normalizar en silencio', () => {
      // Ojo: se evalúa el Decimal crudo, no el ya normalizado por toMoney.
      const crudo = new Prisma.Decimal('10.005');
      expect(motivoDeRechazo(crudo)).toMatch(/decimales/i);
    });

    it('rechaza montos que desbordan la escala del esquema', () => {
      expect(motivoDeRechazo(new Prisma.Decimal('10000000000000'))).toMatch(/excede/i);
    });

    it('rechaza valores no finitos', () => {
      expect(motivoDeRechazo(new Prisma.Decimal(Infinity))).toMatch(/no es un número/i);
    });
  });

  it('distingue positivo de cero', () => {
    expect(esPositivo(toMoney('0.01'))).toBe(true);
    expect(esPositivo(CERO)).toBe(false);
    expect(esPositivo(toMoney('-0.01'))).toBe(false);
  });
});
