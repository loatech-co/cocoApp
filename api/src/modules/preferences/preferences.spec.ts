import {
  KEYS,
  ACCOUNTS_ENABLED,
  DEFAULT_PREFERENCES,
  withDefaults,
  isKnownKey,
} from './preferences';

describe('User preferences', () => {
  describe('defaults', () => {
    // ── The product decision that orders everything else ──
    it('accounts are OFF by default', () => {
      // Recording an expense cannot require having made up an account first.
      expect(DEFAULT_PREFERENCES[ACCOUNTS_ENABLED]).toBe(false);
    });

    it('the default object is frozen', () => {
      // If it were mutable, a service could change the default for EVERY user
      // by accident.
      expect(Object.isFrozen(DEFAULT_PREFERENCES)).toBe(true);
    });
  });

  describe('isKnownKey', () => {
    it('recognises the catalogue ones', () => {
      expect(isKnownKey(ACCOUNTS_ENABLED)).toBe(true);
      for (const key of KEYS) expect(isKnownKey(key)).toBe(true);
    });

    it('rejects any other', () => {
      expect(isKnownKey('lo_que_sea')).toBe(false);
      expect(isKnownKey('')).toBe(false);
    });

    it('is not fooled by properties inherited from Object', () => {
      // `'toString' in object` would be true. That is why hasOwnProperty is used.
      expect(isKnownKey('toString')).toBe(false);
      expect(isKnownKey('constructor')).toBe(false);
    });
  });

  describe('withDefaults', () => {
    it('with nothing stored it returns the defaults', () => {
      expect(withDefaults([])).toEqual(DEFAULT_PREFERENCES);
    });

    it('what is stored wins over the default', () => {
      const result = withDefaults([{ prefKey: ACCOUNTS_ENABLED, prefValue: true }]);
      expect(result[ACCOUNTS_ENABLED]).toBe(true);
    });

    it('returns a copy, not the frozen object', () => {
      const result = withDefaults([]);
      expect(result).not.toBe(DEFAULT_PREFERENCES);
      expect(() => {
        result[ACCOUNTS_ENABLED] = true;
      }).not.toThrow();
    });

    // ── Tolerance: they are interface preferences, they cannot break anything ──
    it('ignores a key that no longer exists', () => {
      expect(withDefaults([{ prefKey: 'preferencia_de_otra_epoca', prefValue: true }])).toEqual(
        DEFAULT_PREFERENCES,
      );
    });

    it.each([
      ['a string', 'true'],
      ['a number', 1],
      ['null', null],
      ['an object', { a: 1 }],
      ['an array', []],
    ])('ignores a value that is %s instead of a boolean', (_, value) => {
      // A badly stored preference cannot stop anybody from seeing their
      // finances: it is dropped and the default is used.
      expect(withDefaults([{ prefKey: ACCOUNTS_ENABLED, prefValue: value }])).toEqual(
        DEFAULT_PREFERENCES,
      );
    });

    it('with several rows, the last one for the same key wins', () => {
      const result = withDefaults([
        { prefKey: ACCOUNTS_ENABLED, prefValue: true },
        { prefKey: ACCOUNTS_ENABLED, prefValue: false },
      ]);
      expect(result[ACCOUNTS_ENABLED]).toBe(false);
    });

    // ── The Spanish key rows were stored under until 7.2-r1 ──
    it('stores the accounts switch under its English key', () => {
      expect(ACCOUNTS_ENABLED).toBe('accounts_enabled');
    });

    it('reads a row stored under the legacy key', () => {
      const result = withDefaults([{ prefKey: 'cuentas_habilitadas', prefValue: true }]);
      expect(result[ACCOUNTS_ENABLED]).toBe(true);
      expect(result).not.toHaveProperty('cuentas_habilitadas');
    });

    it.each([
      ['before', true],
      ['after', false],
    ])('prefers the current key when the legacy row comes %s it', (_, isLegacyFirst) => {
      const legacy = { prefKey: 'cuentas_habilitadas', prefValue: false };
      const current = { prefKey: ACCOUNTS_ENABLED, prefValue: true };
      const rows = isLegacyFirst ? [legacy, current] : [current, legacy];
      expect(withDefaults(rows)[ACCOUNTS_ENABLED]).toBe(true);
    });
  });
});
