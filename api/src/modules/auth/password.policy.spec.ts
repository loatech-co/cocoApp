import {
  LONGITUD_MAXIMA,
  LONGITUD_MINIMA,
  derivaDeDatosPersonales,
  evaluarPolitica,
} from './password.policy';

describe('Política de contraseñas', () => {
  describe('evaluarPolitica', () => {
    it('acepta una contraseña que cumple las cuatro reglas y la longitud', () => {
      expect(evaluarPolitica('Xk9$Ronda-Verde!')).toEqual({ valida: true, problemas: [] });
    });

    it.each([
      ['Ab1$corta', 'Debe tener al menos 12 caracteres.'],
      ['ABCDEFGH1234$', 'Debe incluir al menos una letra minúscula.'],
      ['abcdefgh1234$', 'Debe incluir al menos una letra mayúscula.'],
      ['Abcdefghijkl$', 'Debe incluir al menos un número.'],
      ['Abcdefghijkl1', 'Debe incluir al menos un símbolo (por ejemplo: ! @ # $ % & *).'],
    ])('rechaza %p con el motivo exacto', (password, motivo) => {
      const { valida, problemas } = evaluarPolitica(password);
      expect(valida).toBe(false);
      expect(problemas).toContain(motivo);
    });

    it('acepta exactamente la longitud mínima', () => {
      const password = `Ab1$${'x'.repeat(LONGITUD_MINIMA - 4)}`;
      expect(password).toHaveLength(LONGITUD_MINIMA);
      expect(evaluarPolitica(password).valida).toBe(true);
    });

    it('rechaza por encima del máximo, para que argon2 no sea un vector de denegación', () => {
      const password = `Ab1$${'x'.repeat(LONGITUD_MAXIMA)}`;
      expect(evaluarPolitica(password).problemas).toContain(
        `No puede superar los ${LONGITUD_MAXIMA} caracteres.`,
      );
    });

    it('rechaza espacios al inicio o al final, que casi siempre son un error de copiado', () => {
      const motivo = 'No puede empezar ni terminar con espacios.';
      expect(evaluarPolitica(' Xk9$Ronda-Verde!').problemas).toContain(motivo);
      expect(evaluarPolitica('Xk9$Ronda-Verde! ').problemas).toContain(motivo);
    });

    it('acepta espacios EN MEDIO: las frases largas son buenas contraseñas', () => {
      expect(evaluarPolitica('Un Perro 7 Azul!').valida).toBe(true);
    });

    it('acumula TODOS los incumplimientos, no solo el primero', () => {
      // Corregir de a uno es frustrante y empuja a elegir lo más flojo que pase.
      expect(evaluarPolitica('abc').problemas).toHaveLength(4);
    });
  });

  describe('derivaDeDatosPersonales', () => {
    const datos = { email: 'gerardo@ejemplo.com', displayName: 'Gerardo Viteri' };

    it.each([
      ['Gerardo2026!x', 'el nombre'],
      ['xxViteri2026!', 'el apellido'],
      ['gerardo-Larga1!', 'la parte local del correo'],
      ['MiCocoApp2026!', 'el nombre del producto'],
    ])('rechaza %p porque contiene %s', (password) => {
      expect(derivaDeDatosPersonales(password, datos)).toBe(true);
    });

    it('ignora mayúsculas y minúsculas al comparar', () => {
      expect(derivaDeDatosPersonales('GERARDO-Larga1!', datos)).toBe(true);
    });

    it('acepta una contraseña sin relación con la cuenta', () => {
      expect(derivaDeDatosPersonales('Xk9$Ronda-Verde!', datos)).toBe(false);
    });

    it('no se dispara con fragmentos de menos de 4 letras', () => {
      // Con "Ana" bastarían tres letras para prohibir media lengua española.
      expect(derivaDeDatosPersonales('Xk9$Ronda-Verde!', { displayName: 'Ana' })).toBe(false);
    });

    it('funciona sin datos: nadie tiene por qué haber puesto nombre todavía', () => {
      expect(derivaDeDatosPersonales('Xk9$Ronda-Verde!', {})).toBe(false);
    });
  });
});
