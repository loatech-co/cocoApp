import { afterEach, describe, expect, it } from 'vitest';

import {
  MAX_SHORTCUTS,
  addShortcut,
  readShortcuts,
  moveShortcut,
  forgetShortcuts,
  removeShortcut,
  seedShortcuts,
} from './shortcuts';

/**
 * Esta pantalla estuvo muerta dos días porque el almacén era un par de
 * funciones vacías: cada escritura caía en un agujero y cada redibujo volvía
 * con lo de fábrica, así que añadir, quitar y reordenar parecían tres botones
 * rotos y no lo era ninguno.
 *
 * Por eso lo que se comprueba aquí es lo aburrido: que lo escrito se pueda
 * LEER DE VUELTA.
 */
afterEach(forgetShortcuts);

describe('El almacén de atajos', () => {
  it('se siembra una sola vez', () => {
    seedShortcuts(['/', '/centros-de-costos']);
    seedShortcuts(['/otra-cosa']);
    expect(readShortcuts()).toEqual(['/', '/centros-de-costos']);
  });

  it('lo que se añade se lee de vuelta', () => {
    seedShortcuts(['/']);
    expect(addShortcut('/cuentas')).toBe(true);
    expect(readShortcuts()).toEqual(['/', '/cuentas']);
  });

  it('lo que se quita deja de estar', () => {
    seedShortcuts(['/', '/cuentas']);
    removeShortcut('/cuentas');
    expect(readShortcuts()).toEqual(['/']);
  });

  it('reordenar mueve, no intercambia', () => {
    seedShortcuts(['/a', '/b', '/c']);
    moveShortcut(0, 2);
    expect(readShortcuts()).toEqual(['/b', '/c', '/a']);
  });

  it('el décimo no entra, y se sabe', () => {
    seedShortcuts(Array.from({ length: MAX_SHORTCUTS }, (_, i) => `/p${i}`));
    expect(addShortcut('/uno-mas')).toBe(false);
    expect(readShortcuts()).toHaveLength(MAX_SHORTCUTS);
  });

  it('sembrar de más se recorta al máximo', () => {
    seedShortcuts(Array.from({ length: 20 }, (_, i) => `/p${i}`));
    expect(readShortcuts()).toHaveLength(MAX_SHORTCUTS);
  });

  it('añadir dos veces la misma ruta no la duplica', () => {
    seedShortcuts(['/']);
    addShortcut('/cuentas');
    addShortcut('/cuentas');
    expect(readShortcuts()).toEqual(['/', '/cuentas']);
  });

  it('un índice que no existe no rompe el orden', () => {
    seedShortcuts(['/a', '/b']);
    moveShortcut(0, 9);
    expect(readShortcuts()).toEqual(['/a', '/b']);
  });
});
