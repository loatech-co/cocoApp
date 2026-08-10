import {
  CLAVES,
  CUENTAS_HABILITADAS,
  PREFERENCIAS_POR_DEFECTO,
  combinarConDefectos,
  esClaveConocida,
} from './preferences';

describe('Preferencias del usuario', () => {
  describe('valores por defecto', () => {
    // ── La decisión de producto que ordena todo lo demás ──
    it('las cuentas están APAGADAS por defecto', () => {
      // Registrar un gasto no puede exigir haber inventado antes una cuenta.
      expect(PREFERENCIAS_POR_DEFECTO[CUENTAS_HABILITADAS]).toBe(false);
    });

    it('el objeto por defecto está congelado', () => {
      // Si fuera mutable, un servicio podría alterar el valor por defecto de
      // TODOS los usuarios sin querer.
      expect(Object.isFrozen(PREFERENCIAS_POR_DEFECTO)).toBe(true);
    });
  });

  describe('esClaveConocida', () => {
    it('reconoce las del catálogo', () => {
      expect(esClaveConocida(CUENTAS_HABILITADAS)).toBe(true);
      for (const clave of CLAVES) expect(esClaveConocida(clave)).toBe(true);
    });

    it('rechaza cualquier otra', () => {
      expect(esClaveConocida('lo_que_sea')).toBe(false);
      expect(esClaveConocida('')).toBe(false);
    });

    it('no se deja engañar por propiedades heredadas de Object', () => {
      // `'toString' in objeto` daría true. Por eso se usa hasOwnProperty.
      expect(esClaveConocida('toString')).toBe(false);
      expect(esClaveConocida('constructor')).toBe(false);
    });
  });

  describe('combinarConDefectos', () => {
    it('sin nada guardado devuelve los valores por defecto', () => {
      expect(combinarConDefectos([])).toEqual(PREFERENCIAS_POR_DEFECTO);
    });

    it('lo guardado gana al valor por defecto', () => {
      const resultado = combinarConDefectos([
        { prefKey: CUENTAS_HABILITADAS, prefValue: true },
      ]);
      expect(resultado[CUENTAS_HABILITADAS]).toBe(true);
    });

    it('no devuelve el objeto congelado, sino una copia', () => {
      const resultado = combinarConDefectos([]);
      expect(resultado).not.toBe(PREFERENCIAS_POR_DEFECTO);
      expect(() => {
        resultado[CUENTAS_HABILITADAS] = true;
      }).not.toThrow();
    });

    // ── Tolerancia: son preferencias de interfaz, no pueden tumbar nada ──
    it('ignora una clave que ya no existe', () => {
      expect(
        combinarConDefectos([{ prefKey: 'preferencia_de_otra_epoca', prefValue: true }]),
      ).toEqual(PREFERENCIAS_POR_DEFECTO);
    });

    it.each([
      ['una cadena', 'true'],
      ['un número', 1],
      ['null', null],
      ['un objeto', { a: 1 }],
      ['un arreglo', []],
    ])('ignora un valor que es %s en vez de booleano', (_, valor) => {
      // Una preferencia mal guardada no puede impedirle a nadie ver sus
      // finanzas: se descarta y se usa el valor por defecto.
      expect(combinarConDefectos([{ prefKey: CUENTAS_HABILITADAS, prefValue: valor }])).toEqual(
        PREFERENCIAS_POR_DEFECTO,
      );
    });

    it('con varias filas, la última de la misma clave manda', () => {
      const resultado = combinarConDefectos([
        { prefKey: CUENTAS_HABILITADAS, prefValue: true },
        { prefKey: CUENTAS_HABILITADAS, prefValue: false },
      ]);
      expect(resultado[CUENTAS_HABILITADAS]).toBe(false);
    });
  });
});
