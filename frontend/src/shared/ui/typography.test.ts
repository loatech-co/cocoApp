import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Dos reglas de tipografía que se rompen solas, y por eso se vigilan.
 *
 * Lee el código fuente, como las de los botones, el radio y la superficie
 * flotante: el problema no está en un componente sino en quién escribe la
 * clase, y una clase escrita a mano no la ve nadie hasta que hay quince.
 */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const filePath = join(dir, entry);
    if (statSync(filePath).isDirectory()) return sourceFiles(filePath);
    return filePath.endsWith('.tsx') ? [filePath] : [];
  });
}

const files = sourceFiles(join(import.meta.dirname, '..', '..'));
const relativePath = (filePath: string): string => filePath.split('/src/')[1]!;

describe('La tipografía sale de la escala y no grita', () => {
  it('encuentra los archivos del proyecto', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('ningún rótulo va en mayúsculas sostenidas', () => {
    // Una palabra en versalitas pierde la silueta que la hace reconocible:
    // "Soporte" y "SOPORTE" no se leen igual de rápido. Estaban en el rótulo
    // de los indicadores del resumen y en el grupo de secciones del riel, que
    // son justo los sitios que se leen de reojo.
    const offenders: string[] = [];

    // La palabra suelta, y no un `className=` completo: la clase aparece
    // igual de a menudo dentro de un `cn(...)` con comillas simples, y una
    // expresión que intente abarcar las dos formas se queda corta en la
    // tercera. Aquí «uppercase» solo puede ser la utilidad de Tailwind —los
    // comentarios de este proyecto están en castellano y dicen «mayúsculas
    // sostenidas»—, así que buscarla a secas basta.
    //
    // Con una excepción: `first-letter:uppercase` NO es gritar, es poner en
    // mayúscula una inicial. Lo que prohíbe esta regla es la utilidad suelta,
    // la que pone en versalitas un rótulo entero; de ahí el `(?<![-:\w])`,
    // que descarta cualquier variante que la preceda.
    for (const filePath of files) {
      for (const line of readFileSync(filePath, 'utf8').split('\n')) {
        if (/(?<![-:\w])uppercase\b/.test(line)) {
          offenders.push(`${relativePath(filePath)}: ${line.trim()}`);
        }
      }
    }

    expect(offenders, 'usa minúsculas; el tamaño y el gris ya dicen que es un rótulo').toEqual([]);
  });

  it('ningún tamaño de letra se escribe en píxeles', () => {
    // `text-[11px]` estaba en trece sitios y ya se habían separado: unos con
    // `leading-none` y otros sin él. La escala tiene un escalón para eso,
    // `text-2xs`, declarado en `index.css` con su altura de línea.
    const offenders: string[] = [];

    for (const filePath of files) {
      const code = readFileSync(filePath, 'utf8');
      for (const match of code.matchAll(/\btext-\[\d+(?:\.\d+)?(?:px|rem)\]/g)) {
        offenders.push(`${relativePath(filePath)}: ${match[0]}`);
      }
    }

    expect(offenders, 'usa la escala: text-2xs, text-xs, text-sm…').toEqual([]);
  });
});
