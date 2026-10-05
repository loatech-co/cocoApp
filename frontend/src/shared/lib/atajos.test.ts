import { afterEach, describe, expect, it } from 'vitest';

import {
  MAXIMO_DE_ATAJOS,
  anadirAtajo,
  leerAtajos,
  moverAtajo,
  olvidarAtajos,
  quitarAtajo,
  sembrarAtajos,
} from './atajos';

/**
 * Esta pantalla estuvo muerta dos días porque el almacén era un par de
 * funciones vacías: cada escritura caía en un agujero y cada redibujo volvía
 * con lo de fábrica, así que añadir, quitar y reordenar parecían tres botones
 * rotos y no lo era ninguno.
 *
 * Por eso lo que se comprueba aquí es lo aburrido: que lo escrito se pueda
 * LEER DE VUELTA.
 */
afterEach(olvidarAtajos);

describe('El almacén de atajos', () => {
  it('se siembra una sola vez', () => {
    sembrarAtajos(['/', '/centros-de-costos']);
    sembrarAtajos(['/otra-cosa']);
    expect(leerAtajos()).toEqual(['/', '/centros-de-costos']);
  });

  it('lo que se añade se lee de vuelta', () => {
    sembrarAtajos(['/']);
    expect(anadirAtajo('/cuentas')).toBe(true);
    expect(leerAtajos()).toEqual(['/', '/cuentas']);
  });

  it('lo que se quita deja de estar', () => {
    sembrarAtajos(['/', '/cuentas']);
    quitarAtajo('/cuentas');
    expect(leerAtajos()).toEqual(['/']);
  });

  it('reordenar mueve, no intercambia', () => {
    sembrarAtajos(['/a', '/b', '/c']);
    moverAtajo(0, 2);
    expect(leerAtajos()).toEqual(['/b', '/c', '/a']);
  });

  it('el décimo no entra, y se sabe', () => {
    sembrarAtajos(Array.from({ length: MAXIMO_DE_ATAJOS }, (_, i) => `/p${i}`));
    expect(anadirAtajo('/uno-mas')).toBe(false);
    expect(leerAtajos()).toHaveLength(MAXIMO_DE_ATAJOS);
  });

  it('sembrar de más se recorta al máximo', () => {
    sembrarAtajos(Array.from({ length: 20 }, (_, i) => `/p${i}`));
    expect(leerAtajos()).toHaveLength(MAXIMO_DE_ATAJOS);
  });

  it('añadir dos veces la misma ruta no la duplica', () => {
    sembrarAtajos(['/']);
    anadirAtajo('/cuentas');
    anadirAtajo('/cuentas');
    expect(leerAtajos()).toEqual(['/', '/cuentas']);
  });

  it('un índice que no existe no rompe el orden', () => {
    sembrarAtajos(['/a', '/b']);
    moverAtajo(0, 9);
    expect(leerAtajos()).toEqual(['/a', '/b']);
  });
});
