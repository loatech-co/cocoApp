import { describe, expect, it } from 'vitest';

import { SIN_CLASIFICAR, aplicar, type Propuesta } from './precedencia';

/**
 * «Una fuente inferior nunca reemplaza a una superior ni a la elección
 * manual.» Es la prueba del plan, palabra por palabra.
 */
const manual: Propuesta = { categoryId: 1, origen: 'manual' };
const historial: Propuesta = { categoryId: 2, origen: 'historial' };
const palabras: Propuesta = { categoryId: 3, origen: 'palabras-clave' };
const diccionario: Propuesta = { categoryId: 4, origen: 'diccionario' };

describe('Precedencia de las fuentes', () => {
  it('sobre nada, cualquiera propone', () => {
    expect(aplicar(SIN_CLASIFICAR, diccionario)).toEqual(diccionario);
    expect(aplicar(SIN_CLASIFICAR, historial)).toEqual(historial);
  });

  it('lo elegido a mano no lo toca nada automático', () => {
    expect(aplicar(manual, historial)).toEqual(manual);
    expect(aplicar(manual, palabras)).toEqual(manual);
    expect(aplicar(manual, diccionario)).toEqual(manual);
  });

  it('y una elección a mano se impone a lo que haya', () => {
    expect(aplicar(historial, manual)).toEqual(manual);
    // También quitar: vaciar a mano es una decisión, no un hueco.
    const vaciar = { categoryId: undefined, origen: 'manual' as const };
    expect(aplicar(historial, vaciar)).toEqual(vaciar);
    expect(aplicar(vaciar, diccionario)).toEqual(vaciar);
  });

  it('el historial corrige a las palabras clave y al diccionario, no al revés', () => {
    expect(aplicar(palabras, historial)).toEqual(historial);
    expect(aplicar(diccionario, historial)).toEqual(historial);
    expect(aplicar(historial, palabras)).toEqual(historial);
    expect(aplicar(historial, diccionario)).toEqual(historial);
  });

  it('las palabras clave corrigen al diccionario, no al revés', () => {
    expect(aplicar(diccionario, palabras)).toEqual(palabras);
    expect(aplicar(palabras, diccionario)).toEqual(palabras);
  });

  it('una fuente puede cambiar de opinión sobre sí misma', () => {
    // El historial que sugiere otra cosa al seguir escribiendo sigue siendo el
    // historial: si no pudiera reemplazarse, la primera sugerencia quedaría
    // clavada aunque la descripción ya dijera otra cosa.
    const otroHistorial: Propuesta = { categoryId: 9, origen: 'historial' };
    expect(aplicar(historial, otroHistorial)).toEqual(otroHistorial);
  });
});
