import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * El radio estándar de un contenedor es 10px: `rounded-lg`.
 *
 * Es el `--radius` del tema, y `rounded-lg` es la clase que lo lee. Menor está
 * bien donde haga falta —una casilla, un chip— pero mayor no: dos contenedores
 * vecinos con esquinas distintas se leen como dos sistemas distintos, y es
 * exactamente lo que pasaba con tarjetas de 24px pegadas a tablas de 16.
 *
 * Antes el estándar era `rounded-2xl` y la escala estaba corrida —`rounded-lg`
 * valía 16 y `rounded-xl` 20, porque `--radius` era 1rem—. Con 10px la escala
 * vuelve a crecer en orden: sm 6, md 8, lg 10, xl 14. Lo que pasa de ahí es el
 * 2xl y el 3xl de Tailwind, que no leen el tema, y por eso los prohíbe esta
 * prueba.
 *
 * Lee el código fuente, como la de los botones, porque el problema no está en
 * el componente sino en quién escribe la clase.
 */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const filePath = join(dir, entry);
    if (statSync(filePath).isDirectory()) return sourceFiles(filePath);
    return filePath.endsWith('.tsx') ? [filePath] : [];
  });
}

/** El tope, en píxeles: el `--radius` del tema. */
const MAX_RADIUS_PX = 10;

/**
 * Lo que se permite pasarse, y por qué.
 *
 * · `app/app-shell.tsx` — la esquina del POZO, el hueco donde se abre el
 *   contenido dentro de la página. Lleva `rounded-tl-xl`, que son 14px y es
 *   un valor de la escala del tema, no un número inventado.
 *
 *   Se pasa porque es el contenedor más grande que existe: una esquina de
 *   10px en un canto que mide toda la altura de la ventana casi no se ve, y
 *   lo que esa esquina tiene que contar —que el riel envuelve al contenido en
 *   vez de estar pegado a su lado— depende de que se vea.
 *
 *   Y NO rompe la regla que esta prueba defiende, que es que dos contenedores
 *   VECINOS no tengan esquinas distintas: el pozo no es vecino de ninguna
 *   tarjeta, es el fondo sobre el que se apoyan todas.
 *
 * · `shared/ui/atoms/bottom-sheet.tsx` — las dos esquinas de ARRIBA de una hoja
 *   que sube desde el borde de abajo. Lleva `rounded-t-[16px]`.
 *
 *   Mismo motivo que el pozo y misma forma de no romper la regla. La esquina
 *   mide el ancho entero de la pantalla, así que 10px en ella casi no se ven,
 *   y lo que tiene que contar —que esto es una hoja que subió y que la página
 *   sigue debajo— depende de que se vea. Y no tiene vecinos: está encima de
 *   todo lo demás.
 */
const ALLOWED = new Set<string>(['app/app-shell.tsx', 'shared/ui/atoms/bottom-sheet.tsx']);

describe('Ningún contenedor se pasa del radio estándar', () => {
  const files = sourceFiles(join(import.meta.dirname, '..', '..'));

  it('encuentra los archivos del proyecto', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('no hay radios por encima de 10px', () => {
    const offenders: string[] = [];

    for (const filePath of files) {
      const relativePath = filePath.split('/src/')[1]!;
      if (ALLOWED.has(relativePath)) continue;

      const code = readFileSync(filePath, 'utf8');

      // `xl`, `2xl` y `3xl`: los dos últimos ni siquiera leen el tema.
      for (const match of code.matchAll(/\brounded(?:-[tbrl][lr]?)?-(?:xl|2xl|3xl)\b/g)) {
        offenders.push(`${relativePath}: ${match[0]}`);
      }

      for (const match of code.matchAll(/\brounded(?:-[tbrl][lr]?)?-\[(\d+)px\]/g)) {
        if (Number(match[1]) > MAX_RADIUS_PX) offenders.push(`${relativePath}: ${match[0]}`);
      }
    }

    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});
