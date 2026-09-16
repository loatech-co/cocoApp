import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Esta prueba no mira el componente: mira QUIÉN LO USA.
 *
 * La prueba de al lado demuestra que todas las variantes salen del mismo alto,
 * y aun así seguían apareciendo botones desparejos. Faltaba esto: un
 * `className` en una llamada suelta pisa lo que decide el componente, y es
 * invisible para cualquier prueba que solo mire `buttonVariants`.
 *
 * Si hace falta una medida nueva, se añade un `size` en button.tsx. Escribirla
 * en la llamada es lo que dejó cuatro alturas conviviendo en una misma barra.
 */
function fuentes(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) return fuentes(ruta);
    return ruta.endsWith('.tsx') ? [ruta] : [];
  });
}

/** Las clases que NO puede fijar una llamada: son del tamaño del botón. */
const PROHIBIDAS = /\b(h-\d|h-\[|size-\d|size-\[|py-\d|py-\[|rounded(-[a-z0-9[]|\b))/;

describe('Nadie le cambia el tamaño a un botón desde fuera', () => {
  const archivos = fuentes(join(import.meta.dirname, '..', '..'));

  it('encuentra los archivos del proyecto', () => {
    expect(archivos.length).toBeGreaterThan(10);
  });

  it('ninguna llamada a <Button> trae alto, relleno vertical ni radio', () => {
    const culpables: string[] = [];

    for (const ruta of archivos) {
      const codigo = readFileSync(ruta, 'utf8');

      // Cada `<Button ... >`, con sus saltos de línea.
      for (const etiqueta of codigo.matchAll(/<Button\b[\s\S]*?>/g)) {
        const className = /className=(?:"([^"]*)"|\{cn\(([\s\S]*?)\)\})/.exec(etiqueta[0]);
        if (!className) continue;

        const clases = className[1] ?? className[2] ?? '';
        if (PROHIBIDAS.test(clases)) {
          culpables.push(`${ruta.split('/src/')[1]}: ${clases.trim().slice(0, 80)}`);
        }
      }
    }

    expect(culpables, culpables.join('\n')).toEqual([]);
  });
});
