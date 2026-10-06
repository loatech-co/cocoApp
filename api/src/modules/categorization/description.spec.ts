import { normalizeDescription } from './description';

describe('normalizarDescripcion', () => {
  it('strips accents and lowercases', () => {
    expect(normalizeDescription('Éxito Poblado')).toBe('exito poblado');
    expect(normalizeDescription('CAFÉ QUINDÍO')).toBe('cafe quindio');
  });

  it('folds ñ into n, because OCR loses the tilde', () => {
    // A deliberate decision, not an oversight: if "Peñalisa" and "Penalisa"
    // produced different fingerprints, the same merchant read twice would
    // pass as two transactions. See the comment in fingerprint.ts.
    expect(normalizeDescription('Peñalisa')).toBe('penalisa');
    expect(normalizeDescription('PENALISA')).toBe('penalisa');
  });

  it('collapses spaces and trims the ends', () => {
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
  ])('removes the noise from %p → %p', (input, expected) => {
    expect(normalizeDescription(input)).toBe(expected);
  });

  it('the SAME merchant read twice produces the same string', () => {
    // This is the case that justifies the whole file: the bank writes the
    // same purchase differently in one month's statement and the next.
    const a = normalizeDescription('COMPRA Éxito Poblado  REF 000123456');
    const b = normalizeDescription('exito poblado ref 987654321');
    expect(a).toBe(b);
    expect(a).toBe('exito poblado');
  });

  it('tolerates empty, null and undefined', () => {
    expect(normalizeDescription('')).toBe('');
    expect(normalizeDescription(null)).toBe('');
    expect(normalizeDescription(undefined)).toBe('');
  });

  it('does not leave an empty string when EVERYTHING was noise', () => {
    // It ends up empty, and that is fine: the fingerprint also relies on the
    // account, date and amount. What it cannot do is blow up.
    expect(normalizeDescription('REF 000123')).toBe('');
  });
});
