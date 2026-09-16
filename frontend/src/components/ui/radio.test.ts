import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * El radio estándar de un contenedor es 16px: `rounded-2xl`.
 *
 * Menor está bien donde haga falta —una casilla, un chip, un botón—. Mayor no:
 * dos contenedores vecinos con esquinas distintas se leen como dos sistemas
 * distintos, y es exactamente lo que pasaba con tarjetas de 24px pegadas a
 * tablas de 16.
 *
 * Esta prueba lee el código fuente, como la de los botones, porque el problema
 * no está en el componente sino en quién escribe la clase.
 */
function fuentes(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) return fuentes(ruta);
    return ruta.endsWith('.tsx') ? [ruta] : [];
  });
}

/** El tope, en píxeles. `rounded-2xl` con `--radius-2xl: 1rem`. */
const TOPE = 16;

/**
 * Lo que se permite pasarse, y por qué.
 *
 * La imagen del login lleva 32px porque se pidió así explícitamente, y no es
 * un contenedor de contenido: es una foto a sangre dentro de su marco.
 */
const PERMITIDOS = new Set(['features/auth/login-page.tsx']);

describe('Ningún contenedor se pasa del radio estándar', () => {
  const archivos = fuentes(join(import.meta.dirname, '..', '..'));

  it('encuentra los archivos del proyecto', () => {
    expect(archivos.length).toBeGreaterThan(10);
  });

  it('no hay `rounded-3xl` ni radios arbitrarios por encima de 16px', () => {
    const culpables: string[] = [];

    for (const ruta of archivos) {
      const relativa = ruta.split('/src/')[1];
      if (PERMITIDOS.has(relativa)) continue;

      const codigo = readFileSync(ruta, 'utf8');

      for (const uso of codigo.matchAll(/\brounded(?:-[tbrl][lr]?)?-3xl\b/g)) {
        culpables.push(`${relativa}: ${uso[0]}`);
      }

      for (const uso of codigo.matchAll(/\brounded(?:-[tbrl][lr]?)?-\[(\d+)px\]/g)) {
        if (Number(uso[1]) > TOPE) culpables.push(`${relativa}: ${uso[0]}`);
      }
    }

    expect(culpables, culpables.join('\n')).toEqual([]);
  });
});
