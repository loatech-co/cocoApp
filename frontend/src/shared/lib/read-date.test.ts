import { describe, expect, it } from 'vitest';

import { findDate } from './read-date';

const YEAR = 2026;

describe('Lectura de fechas', () => {
  it('lee el formato ISO, que es inconfundible', () => {
    expect(findDate('2026-08-01 EXITO', YEAR)?.iso).toBe('2026-08-01');
  });

  // ── La ambigüedad que hay que resolver bien ──
  it('01/08 es el 1 de agosto, no el 8 de enero', () => {
    // En Colombia el orden es DÍA/MES. Leerlo al revés desplazaría medio
    // extracto a otro mes sin que nada lo delate.
    expect(findDate('01/08/2026 EXITO', YEAR)?.iso).toBe('2026-08-01');
    expect(findDate('13/08/2026 EXITO', YEAR)?.iso).toBe('2026-08-13');
  });

  it('acepta guiones y puntos como separador', () => {
    expect(findDate('01-08-2026 EXITO', YEAR)?.iso).toBe('2026-08-01');
    expect(findDate('01.08.2026 EXITO', YEAR)?.iso).toBe('2026-08-01');
  });

  it('completa el año de dos dígitos', () => {
    expect(findDate('01/08/26 EXITO', YEAR)?.iso).toBe('2026-08-01');
    expect(findDate('01/08/99 EXITO', YEAR)?.iso).toBe('1999-08-01');
  });

  it('usa el año del encabezado cuando la línea no lo trae', () => {
    // Es el caso más común: un extracto mensual escribe "01/08" porque el año
    // ya está arriba. Sin esto habría que corregir línea por línea.
    expect(findDate('01/08 EXITO POBLADO', YEAR)?.iso).toBe('2026-08-01');
  });

  describe('meses escritos con letra', () => {
    it.each([
      ['01 AGO', '2026-08-01'],
      ['1 de agosto', '2026-08-01'],
      ['AGO 01', '2026-08-01'],
      ['15 DIC', '2026-12-15'],
      ['3 de septiembre', '2026-09-03'],
      ['05 ENE 2025', '2025-01-05'],
    ])('lee %p', (input, expected) => {
      expect(findDate(`${input} EXITO POBLADO`, YEAR)?.iso).toBe(expected);
    });

    it('tolera tildes', () => {
      expect(findDate('01 MARZO', YEAR)?.iso).toBe('2026-03-01');
    });
  });

  it('rechaza una fecha que no existe', () => {
    // 31/02 se convertiría en el 3 de marzo al guardarla: el tipo de error
    // silencioso que descuadra un extracto sin que nadie sepa por qué.
    expect(findDate('31/02/2026 EXITO', YEAR)).toBeNull();
    expect(findDate('32/01/2026 EXITO', YEAR)).toBeNull();
    expect(findDate('01/13/2026 EXITO', YEAR)).toBeNull();
  });

  it('devuelve null cuando no hay fecha', () => {
    expect(findDate('MOVIMIENTOS DEL MES', YEAR)).toBeNull();
    expect(findDate('', YEAR)).toBeNull();
  });

  it('marca dónde estaba, para poder recortar la descripción', () => {
    const line = '01/08/2026 EXITO POBLADO 45.900';
    const date = findDate(line, YEAR)!;
    expect(line.slice(date.end).trim()).toBe('EXITO POBLADO 45.900');
  });
});
