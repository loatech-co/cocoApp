import { describe, expect, it } from 'vitest';

import {
  detectarColumnas,
  faltantes,
  indiceDe,
  normalizarCabecera,
} from './csv-columnas';

/** Atajo: los papeles detectados, en orden. */
const papeles = (cabeceras: string[]) => detectarColumnas(cabeceras).map((c) => c.papel);

describe('Detección de columnas de un CSV', () => {
  describe('normalizarCabecera', () => {
    it('quita tildes, mayúsculas y puntuación', () => {
      expect(normalizarCabecera('  FECHA de Transacción  ')).toBe('fecha de transaccion');
      expect(normalizarCabecera('Valor ($)')).toBe('valor');
      expect(normalizarCabecera('Descripción / Concepto')).toBe('descripcion concepto');
    });

    it('tolera una cabecera vacía', () => {
      expect(normalizarCabecera('')).toBe('');
      expect(normalizarCabecera('   ')).toBe('');
    });
  });

  describe('lo que un archivo real puede traer', () => {
    it.each([
      ['Fecha', 'fecha'],
      ['FECHA MOVIMIENTO', 'fecha'],
      ['Fecha de transacción', 'fecha'],
      ['date', 'fecha'],
      ['Valor', 'monto'],
      ['Monto', 'monto'],
      ['IMPORTE', 'monto'],
      ['amount', 'monto'],
      ['Débito', 'monto'],
      ['Descripción', 'descripcion'],
      ['CONCEPTO', 'descripcion'],
      ['Establecimiento', 'descripcion'],
      ['Tipo', 'tipo'],
      ['Categoría', 'categoria'],
    ])('reconoce %p como %s', (cabecera, esperado) => {
      expect(papeles([cabecera])).toEqual([esperado]);
    });

    it('ignora una columna que no reconoce', () => {
      expect(papeles(['Número de autorización'])).toEqual(['ignorar']);
      expect(papeles([''])).toEqual(['ignorar']);
    });
  });

  describe('archivos completos', () => {
    it('detecta el caso típico de un banco colombiano', () => {
      expect(papeles(['Fecha', 'Descripción', 'Valor', 'Saldo'])).toEqual([
        'fecha',
        'descripcion',
        'monto',
        'ignorar',
      ]);
    });

    it('detecta una exportación en inglés', () => {
      expect(papeles(['Date', 'Description', 'Amount', 'Category'])).toEqual([
        'fecha',
        'descripcion',
        'monto',
        'categoria',
      ]);
    });

    it('no le importa el orden de las columnas', () => {
      expect(papeles(['Valor', 'Fecha', 'Concepto'])).toEqual([
        'monto',
        'fecha',
        'descripcion',
      ]);
    });
  });

  // ── Cada papel se asigna UNA vez ──
  describe('cuando dos columnas compiten por el mismo papel', () => {
    it('gana la coincidencia más específica', () => {
      // "Fecha de corte" no es la fecha del movimiento; "Fecha de transacción"
      // sí. La más larga coincide de forma más específica y se queda.
      const resultado = detectarColumnas(['Fecha', 'Fecha de transacción', 'Valor']);
      expect(indiceDe(resultado, 'fecha')).toBe(1);
      expect(resultado[0]!.papel).toBe('ignorar');
    });

    it('nunca devuelve dos columnas con el mismo papel', () => {
      const resultado = detectarColumnas(['Valor', 'Monto', 'Importe', 'Fecha']);
      const montos = resultado.filter((c) => c.papel === 'monto');
      expect(montos).toHaveLength(1);
    });
  });

  describe('faltantes', () => {
    it('exige fecha y monto, que es lo mínimo para que exista un movimiento', () => {
      expect(faltantes(detectarColumnas(['Fecha', 'Valor']))).toEqual([]);
    });

    it('avisa de lo que falta, no de lo que sobra', () => {
      expect(faltantes(detectarColumnas(['Descripción']))).toEqual(['fecha', 'monto']);
      expect(faltantes(detectarColumnas(['Fecha']))).toEqual(['monto']);
    });

    it('la descripción NO es obligatoria: un gasto sin descripción sigue siendo real', () => {
      expect(faltantes(detectarColumnas(['Fecha', 'Valor']))).toEqual([]);
    });
  });

  describe('indiceDe', () => {
    it('devuelve la posición de la columna', () => {
      const resultado = detectarColumnas(['Descripción', 'Fecha', 'Valor']);
      expect(indiceDe(resultado, 'fecha')).toBe(1);
      expect(indiceDe(resultado, 'monto')).toBe(2);
      expect(indiceDe(resultado, 'descripcion')).toBe(0);
    });

    it('devuelve null si ese papel no está', () => {
      expect(indiceDe(detectarColumnas(['Fecha']), 'categoria')).toBeNull();
    });
  });
});
