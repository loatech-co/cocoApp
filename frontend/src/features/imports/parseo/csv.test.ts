import { describe, expect, it } from 'vitest';

import { detectarDelimitador, parsearCsv, partirLinea } from './csv';

const ANIO = { anioPorDefecto: 2026 };

describe('Lectura de un CSV', () => {
  // ── La trampa colombiana ──
  describe('detectarDelimitador', () => {
    it('reconoce el punto y coma, que es lo que exporta Excel en español', () => {
      // Aquí la coma es el separador DECIMAL. Leer este archivo con coma
      // produciría columnas absurdas y montos rotos.
      const texto = 'Fecha;Descripción;Valor\n01/08/2026;Exito;45.900,50';
      expect(detectarDelimitador(texto)).toBe(';');
    });

    it('reconoce la coma cuando de verdad es el separador', () => {
      const texto = 'Fecha,Descripción,Valor\n2026-08-01,Exito,45900.50';
      expect(detectarDelimitador(texto)).toBe(',');
    });

    it('reconoce la tabulación', () => {
      expect(detectarDelimitador('Fecha\tValor\n2026-08-01\t45900')).toBe('\t');
    });

    it('prefiere el separador CONSISTENTE, no el más frecuente', () => {
      // Las comas de las descripciones aparecen más veces, pero de forma
      // desigual. El punto y coma da el mismo número de columnas siempre.
      const texto = [
        'Fecha;Descripción;Valor',
        '01/08/2026;Exito, sede 80, Medellín;45.900',
        '02/08/2026;Rappi, domicilio;23.500',
      ].join('\n');
      expect(detectarDelimitador(texto)).toBe(';');
    });

    it('no se ahoga con un texto vacío', () => {
      expect(detectarDelimitador('')).toBe(',');
    });
  });

  describe('partirLinea', () => {
    it('parte por el delimitador', () => {
      expect(partirLinea('a;b;c', ';')).toEqual(['a', 'b', 'c']);
    });

    it('respeta el delimitador dentro de comillas', () => {
      // Es el motivo de no partir con split: son DOS campos, no tres.
      expect(partirLinea('"Exito Poblado, sede 80";45900', ';')).toEqual([
        'Exito Poblado, sede 80',
        '45900',
      ]);
    });

    it('entiende una comilla escapada', () => {
      expect(partirLinea('"Dijo ""hola""";10', ';')).toEqual(['Dijo "hola"', '10']);
    });

    it('recorta los espacios de cada campo', () => {
      expect(partirLinea('  a  ;  b  ', ';')).toEqual(['a', 'b']);
    });

    it('conserva los campos vacíos', () => {
      expect(partirLinea('a;;c', ';')).toEqual(['a', '', 'c']);
    });
  });

  describe('el caso típico', () => {
    const CSV = [
      'Fecha;Descripción;Valor',
      '01/08/2026;Exito Poblado;45.900,50',
      '02/08/2026;Rappi;23.500',
      '03/08/2026;Juan Valdez;12.000',
    ].join('\n');

    it('saca un movimiento por fila', () => {
      expect(parsearCsv(CSV, ANIO).movimientos).toHaveLength(3);
    });

    it('lee fecha, monto y descripción', () => {
      expect(parsearCsv(CSV, ANIO).movimientos[0]).toMatchObject({
        date: '2026-08-01',
        amount: '45900.50',
        description: 'Exito Poblado',
        type: 'expense',
      });
    });

    it('respeta los centavos', () => {
      expect(parsearCsv(CSV, ANIO).movimientos[0]!.amount).toBe('45900.50');
    });

    it('45.900 son cuarenta y cinco mil novecientos, no 45 con 90', () => {
      expect(parsearCsv(CSV, ANIO).movimientos[1]!.amount).toBe('23500.00');
    });

    it('no reporta nada como faltante', () => {
      expect(parsearCsv(CSV, ANIO).faltan).toEqual([]);
    });
  });

  // ── La deducción que ahorra corregir cientos de filas ──
  describe('gasto o ingreso', () => {
    it('sin negativos en el archivo, TODO es gasto', () => {
      // Un archivo donde todo es positivo no está usando signos: un positivo
      // no significa "ingreso", significa que ahí no se anotan signos.
      const csv = 'Fecha;Valor\n01/08/2026;45900\n02/08/2026;23500';
      const resultado = parsearCsv(csv, ANIO);

      expect(resultado.usaSignos).toBe(false);
      expect(resultado.movimientos.map((m) => m.type)).toEqual(['expense', 'expense']);
    });

    it('si el archivo usa negativos, un positivo SÍ es un ingreso', () => {
      const csv = 'Fecha;Valor\n01/08/2026;-45900\n02/08/2026;2000000\n03/08/2026;-23500';
      const resultado = parsearCsv(csv, ANIO);

      expect(resultado.usaSignos).toBe(true);
      expect(resultado.movimientos.map((m) => m.type)).toEqual([
        'expense',
        'income',
        'expense',
      ]);
    });

    it('una columna de tipo manda sobre el signo', () => {
      // Es lo más explícito que puede haber en el archivo.
      const csv = 'Fecha;Valor;Tipo\n01/08/2026;45900;Ingreso\n02/08/2026;-100;Gasto';
      expect(parsearCsv(csv, ANIO).movimientos.map((m) => m.type)).toEqual([
        'income',
        'expense',
      ]);
    });

    it.each([
      ['Ingreso', 'income'],
      ['ingreso', 'income'],
      ['Abono', 'income'],
      ['Nómina', 'income'],
      ['Gasto', 'expense'],
      ['Egreso', 'expense'],
      ['Compra', 'expense'],
    ])('reconoce la palabra %p como %s', (palabra, esperado) => {
      const csv = `Fecha;Valor;Tipo\n01/08/2026;45900;${palabra}`;
      expect(parsearCsv(csv, ANIO).movimientos[0]!.type).toBe(esperado);
    });
  });

  describe('cuando falta algo', () => {
    it('sin columna de fecha ni de monto, no importa nada y lo dice', () => {
      const resultado = parsearCsv('Descripción;Notas\nExito;algo', ANIO);
      expect(resultado.movimientos).toEqual([]);
      expect(resultado.faltan).toEqual(['fecha', 'monto']);
    });

    it('sin monto, avisa solo de eso', () => {
      expect(parsearCsv('Fecha;Descripción\n01/08/2026;Exito', ANIO).faltan).toEqual(['monto']);
    });

    it('la descripción NO es obligatoria', () => {
      const resultado = parsearCsv('Fecha;Valor\n01/08/2026;45900', ANIO);
      expect(resultado.faltan).toEqual([]);
      expect(resultado.movimientos[0]!.avisos).toContain('Sin descripción.');
    });

    it('una fila con fecha ilegible se aparta, no se inventa', () => {
      const csv = 'Fecha;Valor\n01/08/2026;45900\nsin fecha;23500\n03/08/2026;12000';
      const resultado = parsearCsv(csv, ANIO);

      expect(resultado.movimientos).toHaveLength(2);
      expect(resultado.filasIgnoradas).toEqual(['sin fecha;23500']);
    });

    it('una fila sin monto legible también se aparta', () => {
      const csv = 'Fecha;Valor\n01/08/2026;45900\n02/08/2026;n/a';
      expect(parsearCsv(csv, ANIO).filasIgnoradas).toEqual(['02/08/2026;n/a']);
    });

    it('sobrevive a un archivo vacío', () => {
      const resultado = parsearCsv('', ANIO);
      expect(resultado.movimientos).toEqual([]);
      expect(resultado.faltan).toEqual(['fecha', 'monto']);
    });

    it('sobrevive a un archivo con solo cabeceras', () => {
      expect(parsearCsv('Fecha;Valor', ANIO).movimientos).toEqual([]);
    });
  });

  describe('archivos del mundo real', () => {
    it('lee una exportación en inglés con formato anglosajón', () => {
      const csv = [
        'Date,Description,Amount',
        '2026-08-01,"Exito Poblado, sede 80",45900.50',
        '2026-08-02,Rappi,23500.00',
      ].join('\n');

      const resultado = parsearCsv(csv, ANIO);
      expect(resultado.delimitador).toBe(',');
      expect(resultado.movimientos[0]).toMatchObject({
        date: '2026-08-01',
        amount: '45900.50',
        description: 'Exito Poblado, sede 80',
      });
    });

    it('ignora las columnas que no reconoce sin descartar la fila', () => {
      const csv = [
        'Fecha;Descripción;Valor;Saldo;Nro. autorización',
        '01/08/2026;Exito;45.900;1.000.000;0012345',
      ].join('\n');

      const resultado = parsearCsv(csv, ANIO);
      expect(resultado.movimientos).toHaveLength(1);
      // El saldo y la autorización no deben confundirse con el monto.
      expect(resultado.movimientos[0]!.amount).toBe('45900.00');
    });

    it('permite corregir a mano el mapeo cuando la detección se equivoca', () => {
      const csv = 'Col1;Col2;Col3\n01/08/2026;Exito;45900';

      // Sin ayuda no reconoce nada.
      expect(parsearCsv(csv, ANIO).faltan).toEqual(['fecha', 'monto']);

      // Con el mapeo corregido, funciona igual.
      const resultado = parsearCsv(csv, {
        ...ANIO,
        mapeoManual: [
          { indice: 0, cabecera: 'Col1', papel: 'fecha' },
          { indice: 1, cabecera: 'Col2', papel: 'descripcion' },
          { indice: 2, cabecera: 'Col3', papel: 'monto' },
        ],
      });

      expect(resultado.faltan).toEqual([]);
      expect(resultado.movimientos[0]).toMatchObject({
        date: '2026-08-01',
        amount: '45900.00',
        description: 'Exito',
      });
    });
  });
});
