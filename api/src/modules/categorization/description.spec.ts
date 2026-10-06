import { normalizeDescription } from './description';

describe('normalizarDescripcion', () => {
  it('quita tildes y baja a minúsculas', () => {
    expect(normalizeDescription('Éxito Poblado')).toBe('exito poblado');
    expect(normalizeDescription('CAFÉ QUINDÍO')).toBe('cafe quindio');
  });

  it('pliega la ñ a n, porque el OCR pierde la virgulilla', () => {
    // Decisión deliberada, no descuido: si "Peñalisa" y "Penalisa"
    // produjeran huellas distintas, el mismo comercio leído dos veces
    // pasaría por dos movimientos. Ver el comentario en fingerprint.ts.
    expect(normalizeDescription('Peñalisa')).toBe('penalisa');
    expect(normalizeDescription('PENALISA')).toBe('penalisa');
  });

  it('colapsa espacios y recorta los extremos', () => {
    expect(normalizeDescription('  D1   calle   10  ')).toBe('d1 calle 10');
  });

  it.each([
    ['Exito Poblado REF 000123456', 'exito poblado'],
    ['D1 AUT 45219', 'd1'],
    ['Rappi comprobante 998877', 'rappi'],
    ['Netflix ****1234', 'netflix'],
    ['Uber terminada en 5678', 'uber'],
    ['Ara 12/07/2026', 'ara'],
    ['Juan Valdez 14:32', 'juan valdez'],
    ['COMPRA Falabella', 'falabella'],
    ['PAGO PSE Claro', 'claro'],
  ])('quita el ruido de %p → %p', (input, expected) => {
    expect(normalizeDescription(input)).toBe(expected);
  });

  it('el MISMO comercio leído dos veces produce la misma cadena', () => {
    // Este es el caso que justifica todo el archivo: el banco escribe la
    // misma compra distinto en el extracto de un mes y en el del siguiente.
    const a = normalizeDescription('COMPRA Éxito Poblado  REF 000123456');
    const b = normalizeDescription('exito poblado ref 987654321');
    expect(a).toBe(b);
    expect(a).toBe('exito poblado');
  });

  it('tolera vacío, null y undefined', () => {
    expect(normalizeDescription('')).toBe('');
    expect(normalizeDescription(null)).toBe('');
    expect(normalizeDescription(undefined)).toBe('');
  });

  it('no deja una cadena vacía cuando TODO era ruido', () => {
    // Queda vacía, y eso está bien: la huella se apoya además en cuenta,
    // fecha y monto. Lo que no puede es reventar.
    expect(normalizeDescription('REF 000123')).toBe('');
  });
});
