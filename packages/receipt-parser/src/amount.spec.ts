import { toNumber, readAmount } from './amount';

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
  ])('reads %s as %d', (text, value) => {
    expect(toNumber(text)).toBe(value);
  });

  it('returns null for text that is not a number', () => {
    expect(toNumber('abc')).toBeNull();
    expect(toNumber('.500')).toBeNull();
  });

  it('returns null when the digits overflow to infinity', () => {
    expect(toNumber('9'.repeat(400))).toBeNull();
  });
});

describe('leerMonto', () => {
  it('returns null when the text has no amount', () => {
    expect(readAmount('')).toBeNull();
    expect(readAmount('gracias por su compra\n\n')).toBeNull();
  });

  it('prefers the total line over a larger reference number', () => {
    const text = ['Número de factura 123456789', 'Subtotal 80.000', 'Total a pagar $ 95.200'].join(
      '\n',
    );
    const amount = readAmount(text);
    expect(amount?.valor).toBe(95200);
    expect(amount?.deLineaDeTotal).toBe(true);
  });

  it('penalises years, times, ids and huge values', () => {
    const text = ['Fecha 2026', 'Hora 10:45 4500', 'NIT 900123456', 'Valor 25.000'].join('\n');
    expect(readAmount(text)?.valor).toBe(25000);
    expect(readAmount('Valor 25.000\n99.000.000.000')?.valor).toBe(25000);
  });

  it('ignores an IPv4 address on a total line', () => {
    expect(readAmount('Total 192.168.100.200 $ 12.000')?.valor).toBe(12000);
  });

  it('skips the IBC line of a payroll form', () => {
    const text = 'IBC 1.300.000\nTotal pagado 520.000';
    expect(readAmount(text, { esPlanilla: true })?.valor).toBe(520000);
  });

  it('breaks a tie in favour of the amount inside the expected range', () => {
    const text = 'Valor 30.000\nValor 60.000';
    expect(readAmount(text, { rango: { min: 25000, max: 35000 } })?.valor).toBe(30000);
    expect(readAmount(text)?.valor).toBe(60000);
  });

  it('cuts the line it reports to 80 normalised characters', () => {
    const amount = readAmount(`Total ${'Á'.repeat(100)} $ 10.000`);
    expect(amount?.linea.length).toBe(80);
    expect(amount?.linea).not.toMatch(/Á/);
  });
});
