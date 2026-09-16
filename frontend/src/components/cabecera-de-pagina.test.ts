import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { TITULO_DE_PAGINA } from './cabecera-de-pagina';

/**
 * La cabecera de una pantalla se dibuja en un solo sitio.
 *
 * Esta regla ya se rompió sola una vez y no por descuido de nadie en
 * particular: ocho pantallas escribían su título a mano y salieron TRES
 * tipografías distintas. Se unificaron, y a la vuelta seguía habiendo una
 * novena —el 404— con la suya.
 *
 * Lee el código fuente, como las de los botones, el radio, la superficie y la
 * tipografía, porque el problema no está en el componente sino en quién decide
 * no usarlo.
 */
function fuentes(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) return fuentes(ruta);
    return ruta.endsWith('.tsx') ? [ruta] : [];
  });
}

const raiz = join(import.meta.dirname, '..');
const archivos = fuentes(raiz).filter((r) => !r.endsWith('cabecera-de-pagina.tsx'));
const relativa = (ruta: string): string => ruta.split('/src/')[1];

/**
 * El contenido de `acciones={…}`, contando llaves.
 *
 * Hace falta contarlas porque dentro hay JSX con sus propias llaves —un
 * `onClick={() => …}`, un `aria-label={…}`— y cortar en la primera `}` dejaría
 * fuera justo el botón que hay que comprobar.
 */
function bloquesDeAcciones(codigo: string): string[] {
  const bloques: string[] = [];
  const ABRE = 'acciones={';

  let desde = codigo.indexOf(ABRE);
  while (desde !== -1) {
    let nivel = 0;
    let i = desde + ABRE.length - 1;

    for (; i < codigo.length; i += 1) {
      if (codigo[i] === '{') nivel += 1;
      else if (codigo[i] === '}') {
        nivel -= 1;
        if (nivel === 0) break;
      }
    }

    bloques.push(codigo.slice(desde, i + 1));
    desde = codigo.indexOf(ABRE, i);
  }

  return bloques;
}

describe('La cabecera de una pantalla se dibuja en un solo sitio', () => {
  it('encuentra los archivos del proyecto', () => {
    expect(archivos.length).toBeGreaterThan(10);
  });

  it('ninguna pantalla escribe su propio título de nivel 1', () => {
    // Se permiten dos formas, y solo dos: la clase compartida —para una
    // pantalla que no es una cabecera, como el 404— y un `sr-only`, que no
    // pinta nada y existe para que la página tenga jerarquía.
    const culpables: string[] = [];

    for (const ruta of archivos) {
      const codigo = readFileSync(ruta, 'utf8');
      for (const uso of codigo.matchAll(/<h1[^>]*>/g)) {
        const etiqueta = uso[0];
        if (etiqueta.includes('TITULO_DE_PAGINA') || etiqueta.includes('sr-only')) continue;
        culpables.push(`${relativa(ruta)}: ${etiqueta}`);
      }
    }

    expect(
      culpables,
      'usa CabeceraDePagina, o su clase TITULO_DE_PAGINA si no es una cabecera',
    ).toEqual([]);
  });

  it('la acción de una cabecera mide `sm`', () => {
    // El tamaño por defecto del botón es `md` (44px), así que un `<Button>` sin
    // `size` dentro de `acciones` es exactamente el error que se acaba de
    // corregir: la misma acción medía 44 en Centros de costos y 36 en el
    // resumen, donde la pone el `Menu`.
    const culpables: string[] = [];

    for (const ruta of archivos) {
      for (const bloque of bloquesDeAcciones(readFileSync(ruta, 'utf8'))) {
        for (const uso of bloque.matchAll(/<Button\b[^>]*>/g)) {
          if (/size="sm(-icon)?"/.test(uso[0])) continue;
          culpables.push(`${relativa(ruta)}: ${uso[0].replace(/\s+/g, ' ').slice(0, 80)}`);
        }
      }
    }

    expect(culpables, 'una acción de cabecera lleva size="sm"').toEqual([]);
  });

  it('la clase del título trae familia, peso y el escalón de la pantalla', () => {
    expect(TITULO_DE_PAGINA).toContain('font-display');
    expect(TITULO_DE_PAGINA).toContain('font-semibold');
    expect(TITULO_DE_PAGINA).toContain('text-2xl');
    expect(TITULO_DE_PAGINA).toContain('sm:text-3xl');
    // El interletraje lo declara el tema en cero y Geist ya viene cerrada.
    expect(TITULO_DE_PAGINA).not.toContain('tracking-');
  });
});
