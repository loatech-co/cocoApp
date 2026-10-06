import { describe, expect, it } from 'vitest';

import { UNCLASSIFIED, apply, type Proposal } from './precedence';

/**
 * «Una fuente inferior nunca reemplaza a una superior ni a la elección
 * manual.» Es la prueba del plan, palabra por palabra.
 */
const manual: Proposal = { categoryId: 1, origin: 'manual' };
const history: Proposal = { categoryId: 2, origin: 'historial' };
const words: Proposal = { categoryId: 3, origin: 'palabras-clave' };
const dictionary: Proposal = { categoryId: 4, origin: 'diccionario' };

describe('Precedencia de las fuentes', () => {
  it('sobre nada, cualquiera propone', () => {
    expect(apply(UNCLASSIFIED, dictionary)).toEqual(dictionary);
    expect(apply(UNCLASSIFIED, history)).toEqual(history);
  });

  it('lo elegido a mano no lo toca nada automático', () => {
    expect(apply(manual, history)).toEqual(manual);
    expect(apply(manual, words)).toEqual(manual);
    expect(apply(manual, dictionary)).toEqual(manual);
  });

  it('y una elección a mano se impone a lo que haya', () => {
    expect(apply(history, manual)).toEqual(manual);
    // También quitar: vaciar a mano es una decisión, no un hueco.
    const empty = { categoryId: undefined, origin: 'manual' as const };
    expect(apply(history, empty)).toEqual(empty);
    expect(apply(empty, dictionary)).toEqual(empty);
  });

  it('el historial corrige a las palabras clave y al diccionario, no al revés', () => {
    expect(apply(words, history)).toEqual(history);
    expect(apply(dictionary, history)).toEqual(history);
    expect(apply(history, words)).toEqual(history);
    expect(apply(history, dictionary)).toEqual(history);
  });

  it('las palabras clave corrigen al diccionario, no al revés', () => {
    expect(apply(dictionary, words)).toEqual(words);
    expect(apply(words, dictionary)).toEqual(words);
  });

  it('una fuente puede cambiar de opinión sobre sí misma', () => {
    // El historial que sugiere otra cosa al seguir escribiendo sigue siendo el
    // historial: si no pudiera reemplazarse, la primera sugerencia quedaría
    // clavada aunque la descripción ya dijera otra cosa.
    const otherHistory: Proposal = { categoryId: 9, origin: 'historial' };
    expect(apply(history, otherHistory)).toEqual(otherHistory);
  });
});
