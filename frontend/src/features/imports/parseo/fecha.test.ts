import { describe, expect, it } from 'vitest';

import { encontrarFecha } from './fecha';

const ANIO = 2026;

describe('Lectura de fechas', () => {
  it('lee el formato ISO, que es inconfundible', () => {
    expect(encontrarFecha('2026-08-01 EXITO', ANIO)?.iso).toBe('2026-08-01');
  });

  // ── La ambigüedad que hay que resolver bien ──
  it('01/08 es el 1 de agosto, no el 8 de enero', () => {
    // En Colombia el orden es DÍA/MES. Leerlo al revés desplazaría medio
    // extracto a otro mes sin que nada lo delate.
    expect(encontrarFecha('01/08/2026 EXITO', ANIO)?.iso).toBe('2026-08-01');
    expect(encontrarFecha('13/08/2026 EXITO', ANIO)?.iso).toBe('2026-08-13');
  });

  it('acepta guiones y puntos como separador', () => {
    expect(encontrarFecha('01-08-2026 EXITO', ANIO)?.iso).toBe('2026-08-01');
    expect(encontrarFecha('01.08.2026 EXITO', ANIO)?.iso).toBe('2026-08-01');
  });

  it('completa el año de dos dígitos', () => {
    expect(encontrarFecha('01/08/26 EXITO', ANIO)?.iso).toBe('2026-08-01');
    expect(encontrarFecha('01/08/99 EXITO', ANIO)?.iso).toBe('1999-08-01');
  });

  it('usa el año del encabezado cuando la línea no lo trae', () => {
    // Es el caso más común: un extracto mensual escribe "01/08" porque el año
    // ya está arriba. Sin esto habría que corregir línea por línea.
    expect(encontrarFecha('01/08 EXITO POBLADO', ANIO)?.iso).toBe('2026-08-01');
  });

  describe('meses escritos con letra', () => {
    it.each([
      ['01 AGO', '2026-08-01'],
      ['1 de agosto', '2026-08-01'],
      ['AGO 01', '2026-08-01'],
      ['15 DIC', '2026-12-15'],
      ['3 de septiembre', '2026-09-03'],
      ['05 ENE 2025', '2025-01-05'],
    ])('lee %p', (entrada, esperado) => {
      expect(encontrarFecha(`${entrada} EXITO POBLADO`, ANIO)?.iso).toBe(esperado);
    });

    it('tolera tildes', () => {
      expect(encontrarFecha('01 MARZO', ANIO)?.iso).toBe('2026-03-01');
    });
  });

  it('rechaza una fecha que no existe', () => {
    // 31/02 se convertiría en el 3 de marzo al guardarla: el tipo de error
    // silencioso que descuadra un extracto sin que nadie sepa por qué.
    expect(encontrarFecha('31/02/2026 EXITO', ANIO)).toBeNull();
    expect(encontrarFecha('32/01/2026 EXITO', ANIO)).toBeNull();
    expect(encontrarFecha('01/13/2026 EXITO', ANIO)).toBeNull();
  });

  it('devuelve null cuando no hay fecha', () => {
    expect(encontrarFecha('MOVIMIENTOS DEL MES', ANIO)).toBeNull();
    expect(encontrarFecha('', ANIO)).toBeNull();
  });

  it('marca dónde estaba, para poder recortar la descripción', () => {
    const linea = '01/08/2026 EXITO POBLADO 45.900';
    const fecha = encontrarFecha(linea, ANIO)!;
    expect(linea.slice(fecha.fin).trim()).toBe('EXITO POBLADO 45.900');
  });
});
