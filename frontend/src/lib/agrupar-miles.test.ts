import { describe, expect, it } from 'vitest';

import { agruparMiles, soloCifras } from './utils';

/**
 * El campo del valor se escribe con los puntos puestos.
 *
 * «453132» no se lee: hay que contar los dígitos de tres en tres para saber si
 * son cuatrocientos mil o cuatro millones, y es el dato más importante de la
 * ficha. Lo que se prueba aquí es que agrupar no estorbe mientras se teclea:
 * una cifra a medias tiene que sobrevivir, y la coma decimal también.
 */
describe('Agrupar los miles', () => {
  it.each([
    ['0', '0'],
    ['1', '1'],
    ['123', '123'],
    ['1234', '1.234'],
    ['453132', '453.132'],
    ['1504200', '1.504.200'],
    ['1234567890', '1.234.567.890'],
  ])('«%s» se escribe «%s»', (crudo, escrito) => {
    expect(agruparMiles(crudo)).toBe(escrito);
  });

  it('la coma decimal se respeta, incluso a medio escribir', () => {
    // Borrar la coma que alguien acaba de teclear es la forma más rápida de
    // que un campo se vuelva imposible de usar.
    expect(agruparMiles('1234,')).toBe('1.234,');
    expect(agruparMiles('1234,5')).toBe('1.234,5');
    expect(agruparMiles('1234,50')).toBe('1.234,50');
  });

  it('el vacío se queda vacío', () => {
    expect(agruparMiles('')).toBe('');
  });
});

describe('Lo que se guarda de lo tecleado', () => {
  it('se queda con las cifras y quita los puntos', () => {
    expect(soloCifras('1.504.200')).toBe('1504200');
    expect(soloCifras('$ 453.132')).toBe('453132');
    expect(soloCifras('mil')).toBe('');
  });

  it('una sola coma: dos no son un número', () => {
    expect(soloCifras('1234,5')).toBe('1234,5');
    expect(soloCifras('1,2,3')).toBe('1,23');
  });

  it('lo guardado se puede volver a agrupar sin perder nada', () => {
    // El viaje de ida y vuelta es lo que garantiza que el valor no se
    // transforme solo al pasar por el campo.
    for (const escrito of ['1.504.200', '453.132', '1.234,50']) {
      expect(agruparMiles(soloCifras(escrito))).toBe(escrito);
    }
  });
});
