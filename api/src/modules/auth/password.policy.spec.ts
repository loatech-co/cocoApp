import { MAX_LENGTH, MIN_LENGTH, derivesFromPersonalData, evaluatePolicy } from './password.policy';

describe('Password policy', () => {
  describe('evaluatePolicy', () => {
    it('accepts a password that meets the four rules and the length', () => {
      expect(evaluatePolicy('Xk9$Ronda-Verde!')).toEqual({ isValid: true, problems: [] });
    });

    it.each([
      ['Ab1$corta', 'Debe tener al menos 12 caracteres.'],
      ['ABCDEFGH1234$', 'Debe incluir al menos una letra minúscula.'],
      ['abcdefgh1234$', 'Debe incluir al menos una letra mayúscula.'],
      ['Abcdefghijkl$', 'Debe incluir al menos un número.'],
      ['Abcdefghijkl1', 'Debe incluir al menos un símbolo (por ejemplo: ! @ # $ % & *).'],
    ])('rejects %p with the exact reason', (password, reason) => {
      const { isValid, problems } = evaluatePolicy(password);
      expect(isValid).toBe(false);
      expect(problems).toContain(reason);
    });

    it('accepts exactly the minimum length', () => {
      const password = `Ab1$${'x'.repeat(MIN_LENGTH - 4)}`;
      expect(password).toHaveLength(MIN_LENGTH);
      expect(evaluatePolicy(password).isValid).toBe(true);
    });

    it('rejects above the maximum, so hashing cannot become a denial vector', () => {
      const password = `Ab1$${'x'.repeat(MAX_LENGTH)}`;
      expect(evaluatePolicy(password).problems).toContain(
        `No puede superar los ${MAX_LENGTH} caracteres.`,
      );
    });

    it('rejects spaces at the start or the end, nearly always a copy-paste mistake', () => {
      const reason = 'No puede empezar ni terminar con espacios.';
      expect(evaluatePolicy(' Xk9$Ronda-Verde!').problems).toContain(reason);
      expect(evaluatePolicy('Xk9$Ronda-Verde! ').problems).toContain(reason);
    });

    it('accepts spaces IN THE MIDDLE: long phrases make good passwords', () => {
      expect(evaluatePolicy('Un Perro 7 Azul!').isValid).toBe(true);
    });

    it('collects EVERY failure, not just the first', () => {
      // Fixing them one at a time is frustrating and pushes toward the weakest thing that passes.
      expect(evaluatePolicy('abc').problems).toHaveLength(4);
    });
  });

  describe('derivesFromPersonalData', () => {
    const personal = { email: 'gerardo@ejemplo.com', displayName: 'Gerardo Viteri' };

    it.each([
      ['Gerardo2026!x', 'the first name'],
      ['xxViteri2026!', 'the last name'],
      ['gerardo-Larga1!', 'the local part of the email'],
      ['MiCocoApp2026!', 'the product name'],
    ])('rejects %p because it contains %s', (password) => {
      expect(derivesFromPersonalData(password, personal)).toBe(true);
    });

    it('ignores case when comparing', () => {
      expect(derivesFromPersonalData('GERARDO-Larga1!', personal)).toBe(true);
    });

    it('accepts a password unrelated to the account', () => {
      expect(derivesFromPersonalData('Xk9$Ronda-Verde!', personal)).toBe(false);
    });

    it('does not fire on fragments shorter than 4 letters', () => {
      // With "Ana", three letters would be enough to ban half the Spanish language.
      expect(derivesFromPersonalData('Xk9$Ronda-Verde!', { displayName: 'Ana' })).toBe(false);
    });

    it('works without data: nobody has to have set a name yet', () => {
      expect(derivesFromPersonalData('Xk9$Ronda-Verde!', {})).toBe(false);
    });
  });
});
