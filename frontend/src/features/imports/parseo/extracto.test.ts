import { describe, expect, it } from 'vitest';

import { parsearExtracto } from './extracto';

const ANIO = { anioPorDefecto: 2026 };

describe('Parseo de un extracto', () => {
  describe('caso base', () => {
    const TEXTO = `
      01/08/2026 EXITO POBLADO 45.900
      02/08/2026 RAPPI COMIDA 23.500
      03/08/2026 JUAN VALDEZ 12.000,50
    `;

    it('saca un movimiento por línea', () => {
      const { movimientos } = parsearExtracto(TEXTO, ANIO);
      expect(movimientos).toHaveLength(3);
    });

    it('lee fecha, monto y descripción', () => {
      const { movimientos } = parsearExtracto(TEXTO, ANIO);
      expect(movimientos[0]).toMatchObject({
        date: '2026-08-01',
        amount: '45900.00',
        type: 'expense',
        description: 'EXITO POBLADO',
      });
    });

    it('respeta los centavos', () => {
      const { movimientos } = parsearExtracto(TEXTO, ANIO);
      expect(movimientos[2]!.amount).toBe('12000.50');
    });

    it('no deja avisos cuando la línea era limpia', () => {
      const { movimientos } = parsearExtracto(TEXTO, ANIO);
      expect(movimientos[0]!.avisos).toEqual([]);
    });
  });

  // ── El problema difícil ──
  describe('columna de saldo corriente', () => {
    it('elige el MONTO, no el saldo, cuando la última columna es un saldo', () => {
      // Quedarse con el saldo produciría cifras absurdas que además se ven
      // plausibles en pantalla. Se deduce del documento, no de cada línea.
      const texto = `
        01/08/2026 EXITO POBLADO 45.900 1.000.000
        02/08/2026 RAPPI COMIDA 23.500 976.500
        03/08/2026 JUAN VALDEZ 12.000 964.500
        04/08/2026 ARA CALLE 10 8.000 956.500
      `;

      const { movimientos, huboColumnaDeSaldo } = parsearExtracto(texto, ANIO);

      expect(huboColumnaDeSaldo).toBe(true);
      expect(movimientos.map((m) => m.amount)).toEqual([
        '45900.00',
        '23500.00',
        '12000.00',
        '8000.00',
      ]);
    });

    it('NO deduce saldo cuando las cifras no encadenan', () => {
      // Dos columnas que no guardan relación aritmética no son saldo: sería
      // temerario descartar la última por si acaso.
      const texto = `
        01/08/2026 EXITO POBLADO 100 45.900
        02/08/2026 RAPPI COMIDA 200 23.500
        03/08/2026 JUAN VALDEZ 300 12.000
        04/08/2026 ARA CALLE 999 8.000
      `;

      const { movimientos, huboColumnaDeSaldo } = parsearExtracto(texto, ANIO);

      expect(huboColumnaDeSaldo).toBe(false);
      expect(movimientos[0]!.amount).toBe('45900.00');
    });

    it('tolera una línea corrupta en un extracto de tamaño real', () => {
      // Una línea mal leída rompe DOS comparaciones: la suya y la de la
      // siguiente, que la usa como referencia. Con nueve líneas eso deja 6 de
      // 8 aciertos, por encima de los dos tercios que se exigen.
      const texto = `
        01/08/2026 UNO 10.000 1.000.000
        02/08/2026 DOS 10.000 990.000
        03/08/2026 TRES 10.000 980.000
        04/08/2026 BASURA 10.000 12.345
        05/08/2026 CINCO 10.000 960.000
        06/08/2026 SEIS 10.000 950.000
        07/08/2026 SIETE 10.000 940.000
        08/08/2026 OCHO 10.000 930.000
        09/08/2026 NUEVE 10.000 920.000
      `;
      expect(parsearExtracto(texto, ANIO).huboColumnaDeSaldo).toBe(true);
    });

    it('en un fragmento corto, una línea corrupta SÍ tumba la deducción', () => {
      // Y está bien que así sea: con cinco líneas no hay evidencia suficiente
      // para descartar una columna entera. Ante la duda, se conserva la última
      // cifra y la revisión decide — mejor eso que borrar el monto correcto.
      const texto = `
        01/08/2026 UNO 10.000 1.000.000
        02/08/2026 DOS 10.000 990.000
        03/08/2026 TRES 10.000 980.000
        04/08/2026 BASURA 10.000 12.345
        05/08/2026 CINCO 10.000 960.000
      `;
      expect(parsearExtracto(texto, ANIO).huboColumnaDeSaldo).toBe(false);
    });

    it('no deduce nada con menos de tres líneas: no hay evidencia suficiente', () => {
      const texto = `
        01/08/2026 EXITO 45.900 954.100
        02/08/2026 RAPPI 23.500 930.600
      `;
      expect(parsearExtracto(texto, ANIO).huboColumnaDeSaldo).toBe(false);
    });
  });

  describe('fechas heredadas', () => {
    it('hereda la fecha de la línea anterior y lo avisa', () => {
      // Los extractos agrupan varios movimientos bajo una misma fecha.
      const texto = `
        01/08/2026 EXITO POBLADO 45.900
        RAPPI COMIDA 23.500
      `;
      const { movimientos } = parsearExtracto(texto, ANIO);

      expect(movimientos[1]).toMatchObject({ date: '2026-08-01', description: 'RAPPI COMIDA' });
      expect(movimientos[1]!.avisos).toContain('La fecha se heredó de la línea anterior.');
    });

    it('ignora una línea con cifras si NUNCA hubo una fecha, y lo reporta', () => {
      // Nunca se inventa una fecha. Aparece en `lineasIgnoradas` para que se
      // vea que se descartó, en vez de desaparecer en silencio.
      const { movimientos, lineasIgnoradas } = parsearExtracto('EXITO POBLADO 45.900', ANIO);

      expect(movimientos).toHaveLength(0);
      expect(lineasIgnoradas).toEqual(['EXITO POBLADO 45.900']);
    });
  });

  describe('gasto o ingreso', () => {
    it('por defecto es gasto', () => {
      expect(parsearExtracto('01/08/2026 EXITO 45.900', ANIO).movimientos[0]!.type).toBe('expense');
    });

    it.each([
      'ABONO NOMINA',
      'CONSIGNACION EFECTIVO',
      'Depósito en cajero',
      'TRANSFERENCIA RECIBIDA',
      'REINTEGRO COMPRA',
      'INTERESES AHORRO',
    ])('reconoce %p como ingreso', (concepto) => {
      const { movimientos } = parsearExtracto(`01/08/2026 ${concepto} 500.000`, ANIO);
      expect(movimientos[0]!.type).toBe('income');
    });

    it('un monto negativo es gasto aunque el texto suene a ingreso', () => {
      // El signo manda sobre la palabra: "devolución -45.900" es plata que sale.
      const { movimientos } = parsearExtracto('01/08/2026 DEVOLUCION -45.900', ANIO);
      expect(movimientos[0]!.type).toBe('expense');
    });
  });

  describe('ruido del documento', () => {
    it.each([
      'SALDO ANTERIOR 1.000.000',
      'SALDO FINAL 950.000',
      'TOTAL CARGOS 50.000',
      'CUPO DISPONIBLE 2.000.000',
      'PAGO MINIMO 120.000',
      'Página 1 de 3',
    ])('descarta %p, que no es un movimiento', (linea) => {
      const texto = `01/08/2026 EXITO 45.900\n${linea}`;
      const { movimientos } = parsearExtracto(texto, ANIO);
      expect(movimientos).toHaveLength(1);
      expect(movimientos[0]!.description).toBe('EXITO');
    });

    it('ignora líneas sin ninguna cifra', () => {
      const texto = 'MOVIMIENTOS DEL MES\n01/08/2026 EXITO 45.900\nFIN';
      expect(parsearExtracto(texto, ANIO).movimientos).toHaveLength(1);
    });

    // ── Inventar dinero es el peor fallo posible de esta app ──
    it('NO convierte un número de referencia en un movimiento', () => {
      // Antes de arreglarlo, esta línea producía un gasto de $456 salido de la
      // nada, con su fecha y su descripción, indistinguible de uno real.
      const { movimientos } = parsearExtracto(
        '01/08/2026 TRANSFERENCIA INTERNA REF 000123456',
        ANIO,
      );
      expect(movimientos).toEqual([]);
    });

    it.each([
      ['01/08/2026 TERPEL CALLE 10 AUT 4521 180.000', '180000.00', 'TERPEL CALLE 10'],
      ['01/08/2026 NETFLIX.COM ****1234 38.900', '38900.00', 'NETFLIX.COM'],
      ['01/08/2026 EXITO COMPROBANTE 998877 45.900', '45900.00', 'EXITO'],
      ['01/08/2026 UBER terminada en 5678 18.700', '18700.00', 'UBER'],
    ])('lee el monto real de %p, ignorando la referencia', (linea, monto, descripcion) => {
      const { movimientos } = parsearExtracto(linea, ANIO);
      expect(movimientos).toHaveLength(1);
      expect(movimientos[0]!.amount).toBe(monto);
      expect(movimientos[0]!.description).toBe(descripcion);
    });

    it('avisa cuando la línea traía más cifras de las esperadas', () => {
      const { movimientos } = parsearExtracto(
        '01/08/2026 CUOTA 003 DE 012 EXITO 45.900 12.345 99.999',
        ANIO,
      );
      expect(movimientos[0]!.avisos.some((a) => a.includes('cifras'))).toBe(true);
    });

    it('sobrevive a un texto vacío', () => {
      expect(parsearExtracto('', ANIO)).toEqual({
        movimientos: [],
        lineasIgnoradas: [],
        huboColumnaDeSaldo: false,
      });
    });

    it('sobrevive a basura del OCR', () => {
      const { movimientos } = parsearExtracto('|||  ~~~ ###  \n \n   ', ANIO);
      expect(movimientos).toEqual([]);
    });
  });

  describe('extracto realista', () => {
    it('lee un extracto de tarjeta con encabezado, saldos y pie', () => {
      const texto = `
        BANCOLOMBIA - ESTADO DE CUENTA
        Corte: 31/08/2026
        SALDO ANTERIOR 1.500.000
        01/08 COMPRA EXITO POBLADO REF 0012 45.900 1.454.100
        03/08 RAPPI*RESTAURANTE 23.500 1.430.600
        05/08 ABONO NOMINA 2.000.000 3.430.600
        12/08 NETFLIX ****1234 38.900 3.391.700
        SALDO FINAL 3.391.700
        Página 1 de 1
      `;

      const { movimientos, huboColumnaDeSaldo } = parsearExtracto(texto, ANIO);

      expect(huboColumnaDeSaldo).toBe(true);
      expect(movimientos).toHaveLength(4);
      expect(movimientos.map((m) => [m.date, m.amount, m.type])).toEqual([
        ['2026-08-01', '45900.00', 'expense'],
        ['2026-08-03', '23500.00', 'expense'],
        ['2026-08-05', '2000000.00', 'income'],
        ['2026-08-12', '38900.00', 'expense'],
      ]);
      expect(movimientos[0]!.description).toContain('EXITO POBLADO');
    });
  });
});
