import { aNumero, leerMonto } from './monto';

describe('aNumero', () => {
  it.each([
    ['89.900', 89900],
    ['89,900', 89900],
    ['1.234.567', 1234567],
    ['1.234,56', 1234.56],
    ['1,234.56', 1234.56],
    ['$ 45.000', 45000],
    ['12,5', 12.5],
    ['12.50', 12.5],
    ['150000', 150000],
  ])('reads %s as %d', (texto, valor) => {
    expect(aNumero(texto)).toBe(valor);
  });

  it('returns null for text that is not a number', () => {
    expect(aNumero('abc')).toBeNull();
    expect(aNumero('.500')).toBeNull();
  });

  it('returns null when the digits overflow to infinity', () => {
    expect(aNumero('9'.repeat(400))).toBeNull();
  });
});

describe('leerMonto', () => {
  it('returns null when the text has no amount', () => {
    expect(leerMonto('')).toBeNull();
    expect(leerMonto('gracias por su compra\n\n')).toBeNull();
  });

  it('prefers the total line over a larger reference number', () => {
    const texto = ['Número de factura 123456789', 'Subtotal 80.000', 'Total a pagar $ 95.200'].join(
      '\n',
    );
    const monto = leerMonto(texto);
    expect(monto?.valor).toBe(95200);
    expect(monto?.deLineaDeTotal).toBe(true);
  });

  it('penalises years, times, ids and huge values', () => {
    const texto = ['Fecha 2026', 'Hora 10:45 4500', 'NIT 900123456', 'Valor 25.000'].join('\n');
    expect(leerMonto(texto)?.valor).toBe(25000);
    expect(leerMonto('Valor 25.000\n99.000.000.000')?.valor).toBe(25000);
  });

  it('ignores an IPv4 address on a total line', () => {
    expect(leerMonto('Total 192.168.100.200 $ 12.000')?.valor).toBe(12000);
  });

  it('skips the IBC line of a payroll form', () => {
    const texto = 'IBC 1.300.000\nTotal pagado 520.000';
    expect(leerMonto(texto, { esPlanilla: true })?.valor).toBe(520000);
  });

  it('breaks a tie in favour of the amount inside the expected range', () => {
    const texto = 'Valor 30.000\nValor 60.000';
    expect(leerMonto(texto, { rango: { min: 25000, max: 35000 } })?.valor).toBe(30000);
    expect(leerMonto(texto)?.valor).toBe(60000);
  });

  it('cuts the line it reports to 80 normalised characters', () => {
    const monto = leerMonto(`Total ${'Á'.repeat(100)} $ 10.000`);
    expect(monto?.linea.length).toBe(80);
    expect(monto?.linea).not.toMatch(/Á/);
  });
});
