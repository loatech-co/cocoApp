import {
  KEYS,
  ACCOUNTS_ENABLED,
  DEFAULT_PREFERENCES,
  withDefaults,
  isKnownKey,
} from './preferences';

describe('Preferencias del usuario', () => {
  describe('valores por defecto', () => {
    // ── La decisión de producto que ordena todo lo demás ──
    it('las cuentas están APAGADAS por defecto', () => {
      // Registrar un gasto no puede exigir haber inventado antes una cuenta.
      expect(DEFAULT_PREFERENCES[ACCOUNTS_ENABLED]).toBe(false);
    });

    it('el objeto por defecto está congelado', () => {
      // Si fuera mutable, un servicio podría alterar el valor por defecto de
      // TODOS los usuarios sin querer.
      expect(Object.isFrozen(DEFAULT_PREFERENCES)).toBe(true);
    });
  });

  describe('esClaveConocida', () => {
    it('reconoce las del catálogo', () => {
      expect(isKnownKey(ACCOUNTS_ENABLED)).toBe(true);
      for (const key of KEYS) expect(isKnownKey(key)).toBe(true);
    });

    it('rechaza cualquier otra', () => {
      expect(isKnownKey('lo_que_sea')).toBe(false);
      expect(isKnownKey('')).toBe(false);
    });

    it('no se deja engañar por propiedades heredadas de Object', () => {
      // `'toString' in objeto` daría true. Por eso se usa hasOwnProperty.
      expect(isKnownKey('toString')).toBe(false);
      expect(isKnownKey('constructor')).toBe(false);
    });
  });

  describe('combinarConDefectos', () => {
    it('sin nada guardado devuelve los valores por defecto', () => {
      expect(withDefaults([])).toEqual(DEFAULT_PREFERENCES);
    });

    it('lo guardado gana al valor por defecto', () => {
      const result = withDefaults([{ prefKey: ACCOUNTS_ENABLED, prefValue: true }]);
      expect(result[ACCOUNTS_ENABLED]).toBe(true);
    });

    it('no devuelve el objeto congelado, sino una copia', () => {
      const result = withDefaults([]);
      expect(result).not.toBe(DEFAULT_PREFERENCES);
      expect(() => {
        result[ACCOUNTS_ENABLED] = true;
      }).not.toThrow();
    });

    // ── Tolerancia: son preferencias de interfaz, no pueden tumbar nada ──
    it('ignora una clave que ya no existe', () => {
      expect(withDefaults([{ prefKey: 'preferencia_de_otra_epoca', prefValue: true }])).toEqual(
        DEFAULT_PREFERENCES,
      );
    });

    it.each([
      ['una cadena', 'true'],
      ['un número', 1],
      ['null', null],
      ['un objeto', { a: 1 }],
      ['un arreglo', []],
    ])('ignora un valor que es %s en vez de booleano', (_, value) => {
      // Una preferencia mal guardada no puede impedirle a nadie ver sus
      // finanzas: se descarta y se usa el valor por defecto.
      expect(withDefaults([{ prefKey: ACCOUNTS_ENABLED, prefValue: value }])).toEqual(
        DEFAULT_PREFERENCES,
      );
    });

    it('con varias filas, la última de la misma clave manda', () => {
      const result = withDefaults([
        { prefKey: ACCOUNTS_ENABLED, prefValue: true },
        { prefKey: ACCOUNTS_ENABLED, prefValue: false },
      ]);
      expect(result[ACCOUNTS_ENABLED]).toBe(false);
    });
  });
});
