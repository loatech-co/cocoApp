import { toMoney } from '../../common/money/money';
import { aFechaISO, calcularHuella, normalizarDescripcion } from './fingerprint';

describe('Huella de deduplicación', () => {
  describe('normalizarDescripcion', () => {
    it('quita tildes y baja a minúsculas', () => {
      expect(normalizarDescripcion('Éxito Poblado')).toBe('exito poblado');
      expect(normalizarDescripcion('CAFÉ QUINDÍO')).toBe('cafe quindio');
    });

    it('pliega la ñ a n, porque el OCR pierde la virgulilla', () => {
      // Decisión deliberada, no descuido: si "Peñalisa" y "Penalisa"
      // produjeran huellas distintas, el mismo comercio leído dos veces
      // pasaría por dos movimientos. Ver el comentario en fingerprint.ts.
      expect(normalizarDescripcion('Peñalisa')).toBe('penalisa');
      expect(normalizarDescripcion('PENALISA')).toBe('penalisa');
    });

    it('colapsa espacios y recorta los extremos', () => {
      expect(normalizarDescripcion('  D1   calle   10  ')).toBe('d1 calle 10');
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
    ])('quita el ruido de %p → %p', (entrada, esperado) => {
      expect(normalizarDescripcion(entrada)).toBe(esperado);
    });

    it('el MISMO comercio leído dos veces produce la misma cadena', () => {
      // Este es el caso que justifica todo el archivo: el banco escribe la
      // misma compra distinto en el extracto de un mes y en el del siguiente.
      const a = normalizarDescripcion('COMPRA Éxito Poblado  REF 000123456');
      const b = normalizarDescripcion('exito poblado ref 987654321');
      expect(a).toBe(b);
      expect(a).toBe('exito poblado');
    });

    it('tolera vacío, null y undefined', () => {
      expect(normalizarDescripcion('')).toBe('');
      expect(normalizarDescripcion(null)).toBe('');
      expect(normalizarDescripcion(undefined)).toBe('');
    });

    it('no deja una cadena vacía cuando TODO era ruido', () => {
      // Queda vacía, y eso está bien: la huella se apoya además en cuenta,
      // fecha y monto. Lo que no puede es reventar.
      expect(normalizarDescripcion('REF 000123')).toBe('');
    });
  });

  describe('aFechaISO', () => {
    it('lee la fecha en UTC, no en la zona local', () => {
      // MariaDB devuelve las columnas DATE como medianoche UTC. Leerlas en
      // hora local desplazaría el día en Bogotá (UTC-5): el 1 se leería como
      // el 31 del mes anterior y la huella dejaría de coincidir.
      expect(aFechaISO(new Date('2026-08-01T00:00:00.000Z'))).toBe('2026-08-01');
      expect(aFechaISO(new Date('2026-01-01T00:00:00.000Z'))).toBe('2026-01-01');
    });

    it('rellena mes y día con cero', () => {
      expect(aFechaISO(new Date('2026-03-05T00:00:00.000Z'))).toBe('2026-03-05');
    });
  });

  describe('calcularHuella', () => {
    const base = {
      accountId: 1n,
      date: new Date('2026-08-01T00:00:00.000Z'),
      amount: toMoney('45900.00'),
      description: 'Exito Poblado',
    };

    it('es determinista', () => {
      expect(calcularHuella(base)).toBe(calcularHuella(base));
    });

    it('devuelve 64 caracteres hexadecimales, el ancho de la columna', () => {
      expect(calcularHuella(base)).toMatch(/^[0-9a-f]{64}$/);
    });

    it('ignora la forma en que venía escrito el monto', () => {
      // "45900" y "45900.00" son el mismo dinero: si produjeran huellas
      // distintas, el dedupe fallaría según cómo parseó el extractor.
      expect(calcularHuella({ ...base, amount: toMoney('45900') })).toBe(calcularHuella(base));
    });

    it('ignora el ruido de la descripción', () => {
      expect(
        calcularHuella({ ...base, description: 'COMPRA ÉXITO POBLADO REF 0099' }),
      ).toBe(calcularHuella(base));
    });

    it.each([
      ['la cuenta', { accountId: 2n }],
      ['la fecha', { date: new Date('2026-08-02T00:00:00.000Z') }],
      ['el monto', { amount: toMoney('45900.01') }],
      ['el comercio', { description: 'Carulla Poblado' }],
    ])('cambia si cambia %s', (_, diferencia) => {
      expect(calcularHuella({ ...base, ...diferencia })).not.toBe(calcularHuella(base));
    });

    it('distingue un centavo', () => {
      // El caso que más importa en una app de finanzas: si un centavo no
      // cambiara la huella, se descartarían movimientos legítimos.
      const a = calcularHuella({ ...base, amount: toMoney('45900.00') });
      const b = calcularHuella({ ...base, amount: toMoney('45900.01') });
      expect(a).not.toBe(b);
    });

    it('el mismo cobro en dos cuentas son dos movimientos distintos', () => {
      expect(calcularHuella({ ...base, accountId: 9n })).not.toBe(calcularHuella(base));
    });

    it('funciona sin descripción', () => {
      expect(calcularHuella({ ...base, description: null })).toMatch(/^[0-9a-f]{64}$/);
    });
  });
});
