import { MAX_LENGTH, MIN_LENGTH, derivesFromPersonalData, evaluatePolicy } from './password.policy';

describe('Política de contraseñas', () => {
  describe('evaluarPolitica', () => {
    it('acepta una contraseña que cumple las cuatro reglas y la longitud', () => {
      expect(evaluatePolicy('Xk9$Ronda-Verde!')).toEqual({ isValid: true, problems: [] });
    });

    it.each([
      ['Ab1$corta', 'Debe tener al menos 12 caracteres.'],
      ['ABCDEFGH1234$', 'Debe incluir al menos una letra minúscula.'],
      ['abcdefgh1234$', 'Debe incluir al menos una letra mayúscula.'],
      ['Abcdefghijkl$', 'Debe incluir al menos un número.'],
      ['Abcdefghijkl1', 'Debe incluir al menos un símbolo (por ejemplo: ! @ # $ % & *).'],
    ])('rechaza %p con el motivo exacto', (password, reason) => {
      const { isValid, problems } = evaluatePolicy(password);
      expect(isValid).toBe(false);
      expect(problems).toContain(reason);
    });

    it('acepta exactamente la longitud mínima', () => {
      const password = `Ab1$${'x'.repeat(MIN_LENGTH - 4)}`;
      expect(password).toHaveLength(MIN_LENGTH);
      expect(evaluatePolicy(password).isValid).toBe(true);
    });

    it('rechaza por encima del máximo, para que argon2 no sea un vector de denegación', () => {
      const password = `Ab1$${'x'.repeat(MAX_LENGTH)}`;
      expect(evaluatePolicy(password).problems).toContain(
        `No puede superar los ${MAX_LENGTH} caracteres.`,
      );
    });

    it('rechaza espacios al inicio o al final, que casi siempre son un error de copiado', () => {
      const reason = 'No puede empezar ni terminar con espacios.';
      expect(evaluatePolicy(' Xk9$Ronda-Verde!').problems).toContain(reason);
      expect(evaluatePolicy('Xk9$Ronda-Verde! ').problems).toContain(reason);
    });

    it('acepta espacios EN MEDIO: las frases largas son buenas contraseñas', () => {
      expect(evaluatePolicy('Un Perro 7 Azul!').isValid).toBe(true);
    });

    it('acumula TODOS los incumplimientos, no solo el primero', () => {
      // Corregir de a uno es frustrante y empuja a elegir lo más flojo que pase.
      expect(evaluatePolicy('abc').problems).toHaveLength(4);
    });
  });

  describe('derivaDeDatosPersonales', () => {
    const personal = { email: 'gerardo@ejemplo.com', displayName: 'Gerardo Viteri' };

    it.each([
      ['Gerardo2026!x', 'el nombre'],
      ['xxViteri2026!', 'el apellido'],
      ['gerardo-Larga1!', 'la parte local del correo'],
      ['MiCocoApp2026!', 'el nombre del producto'],
    ])('rechaza %p porque contiene %s', (password) => {
      expect(derivesFromPersonalData(password, personal)).toBe(true);
    });

    it('ignora mayúsculas y minúsculas al comparar', () => {
      expect(derivesFromPersonalData('GERARDO-Larga1!', personal)).toBe(true);
    });

    it('acepta una contraseña sin relación con la cuenta', () => {
      expect(derivesFromPersonalData('Xk9$Ronda-Verde!', personal)).toBe(false);
    });

    it('no se dispara con fragmentos de menos de 4 letras', () => {
      // Con "Ana" bastarían tres letras para prohibir media lengua española.
      expect(derivesFromPersonalData('Xk9$Ronda-Verde!', { displayName: 'Ana' })).toBe(false);
    });

    it('funciona sin datos: nadie tiene por qué haber puesto nombre todavía', () => {
      expect(derivesFromPersonalData('Xk9$Ronda-Verde!', {})).toBe(false);
    });
  });
});
