import { describe, expect, it } from 'vitest';

import { encontrarMontos, normalizarMonto } from './monto';

describe('Lectura de montos', () => {
  describe('normalizarMonto', () => {
    it('lee el formato colombiano: punto de miles, coma decimal', () => {
      expect(normalizarMonto('1.234.567,89')).toBe('1234567.89');
      expect(normalizarMonto('$ 1.234.567,89')).toBe('1234567.89');
    });

    it('lee el formato anglosajón: coma de miles, punto decimal', () => {
      expect(normalizarMonto('1,234,567.89')).toBe('1234567.89');
    });

    // ── La confusión que más caro cuesta ──
    it('45.900 son cuarenta y cinco mil novecientos pesos, NO 45 con 90', () => {
      // `parseFloat('45.900')` daría 45.9 y el extracto entero quedaría mil
      // veces mal, con cifras que además se ven plausibles en pantalla.
      expect(normalizarMonto('45.900')).toBe('45900.00');
      expect(normalizarMonto('$45.900')).toBe('45900.00');
    });

    it('un separador seguido de 1 o 2 dígitos sí es decimal', () => {
      expect(normalizarMonto('45,90')).toBe('45.90');
      expect(normalizarMonto('45.9')).toBe('45.90');
    });

    it('varios separadores iguales son siempre de miles', () => {
      expect(normalizarMonto('1.234.567')).toBe('1234567.00');
      expect(normalizarMonto('1,234,567')).toBe('1234567.00');
    });

    it('sin separadores', () => {
      expect(normalizarMonto('45900')).toBe('45900.00');
      expect(normalizarMonto('0')).toBe('0.00');
    });

    it('quita el símbolo, los espacios y los signos', () => {
      expect(normalizarMonto('-$ 45.900')).toBe('45900.00');
      expect(normalizarMonto('(45.900)')).toBe('45900.00');
    });

    it('devuelve siempre dos decimales', () => {
      expect(normalizarMonto('45,5')).toBe('45.50');
      expect(normalizarMonto('100')).toBe('100.00');
    });

    it('devuelve null si no hay ningún dígito', () => {
      expect(normalizarMonto('')).toBeNull();
      expect(normalizarMonto('$')).toBeNull();
      expect(normalizarMonto('abc')).toBeNull();
    });
  });

  describe('encontrarMontos', () => {
    it('encuentra un monto suelto y marca dónde empieza', () => {
      const linea = 'EXITO POBLADO 45.900';
      const montos = encontrarMontos(linea);

      expect(montos).toHaveLength(1);
      expect(montos[0]).toMatchObject({ valor: '45900.00', negativo: false });
      // La posición sirve para recortar la descripción: lo que queda antes del
      // monto tiene que ser el comercio, ya sin el espacio de separación.
      expect(linea.slice(0, montos[0]!.inicio)).toBe('EXITO POBLADO');
      expect(linea.slice(montos[0]!.fin)).toBe('');
    });

    it('encuentra varios montos en orden: monto y saldo corriente', () => {
      const montos = encontrarMontos('01/08 EXITO POBLADO 45.900 1.234.567');
      expect(montos.map((m) => m.valor)).toEqual(['45900.00', '1234567.00']);
    });

    it('detecta el negativo por guion y por paréntesis', () => {
      expect(encontrarMontos('PAGO -45.900')[0]!.negativo).toBe(true);
      expect(encontrarMontos('PAGO (45.900)')[0]!.negativo).toBe(true);
      // Algunos extractos ponen el signo detrás.
      expect(encontrarMontos('PAGO 45.900-')[0]!.negativo).toBe(true);
    });

    it('ignora los números de menos de tres dígitos', () => {
      // Un "01" es un día o una cuota, no un monto.
      const montos = encontrarMontos('01 CUOTA 3 DE 12 POR 45.900');
      expect(montos.map((m) => m.valor)).toEqual(['45900.00']);
    });

    it('no encuentra nada en una línea sin cifras', () => {
      expect(encontrarMontos('MOVIMIENTOS DEL MES')).toEqual([]);
    });
  });
});
