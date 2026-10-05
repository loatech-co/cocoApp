import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { USER_AGENT_APP } from '@coco/types';

import { CONSULTA_ESCRITORIO, CONSULTA_MOVIL, useEnLaApp } from './movil';

/**
 * Las dos consultas tienen que ser COMPLEMENTARIAS.
 *
 * Un tamaño que cayera en las dos pintaría el riel y la barra de abajo a la
 * vez; uno que no cayera en ninguna se quedaría sin navegación. Escritas a
 * mano, ninguna de las dos cosas se ve leyendo: se ven probando.
 *
 * Por eso esta prueba trae un evaluador mínimo —solo entiende `max-width`,
 * `min-width` y `orientation`, que es todo lo que usan estas dos cadenas— y
 * barre una rejilla de tamaños reales.
 */
function evalua(consulta: string, ancho: number, alto: number): boolean {
  return consulta.split(',').some((rama) =>
    rama
      .split(' and ')
      .map((c) => c.trim())
      .every((condicion) => {
        const [, rasgo, valor] = /^\(([a-z-]+):\s*(.+)\)$/.exec(condicion) ?? [];
        if (!rasgo) throw new Error(`No sé evaluar: ${condicion}`);

        if (rasgo === 'orientation') {
          // La definición de CSS: vertical es alto MAYOR O IGUAL que ancho. Un
          // cuadrado es vertical.
          return valor === 'portrait' ? alto >= ancho : ancho > alto;
        }

        const px = Number(valor!.replace('px', ''));
        if (rasgo === 'max-width') return ancho <= px;
        if (rasgo === 'min-width') return ancho >= px;
        throw new Error(`No sé evaluar: ${condicion}`);
      }),
  );
}

/** Aparatos de verdad, no números redondos. */
const APARATOS: [nombre: string, ancho: number, alto: number, esMovil: boolean][] = [
  ['iPhone 15 vertical', 390, 844, true],
  ['iPhone 15 horizontal', 844, 390, false],
  ['iPad mini vertical', 744, 1133, true],
  ['iPad Air vertical', 820, 1180, true],
  ['iPad Pro 11" vertical', 834, 1194, true],
  ['iPad Pro 12,9" vertical', 1024, 1366, true],
  ['ventana angosta en horizontal', 700, 500, true],
  ['iPad Pro 12,9" horizontal', 1366, 1024, false],
  ['iPad Pro 11" horizontal', 1194, 834, false],
  ['iPad 9 horizontal', 1024, 768, false],
  ['portátil', 1440, 900, false],
  ['monitor girado', 1200, 1920, false],
];

describe('El corte entre el teléfono y el escritorio', () => {
  it.each(APARATOS)('%s cae donde debe', (_nombre, ancho, alto, esMovil) => {
    expect(evalua(CONSULTA_MOVIL, ancho, alto)).toBe(esMovil);
    expect(evalua(CONSULTA_ESCRITORIO, ancho, alto)).toBe(!esMovil);
  });

  it('ningún tamaño cae en las dos ni en ninguna', () => {
    const sinRespuesta: string[] = [];

    for (let ancho = 200; ancho <= 2000; ancho += 1) {
      for (const alto of [ancho - 1, ancho, ancho + 1, 400, 900, 1400]) {
        if (alto < 1) continue;
        const movil = evalua(CONSULTA_MOVIL, ancho, alto);
        const escritorio = evalua(CONSULTA_ESCRITORIO, ancho, alto);
        if (movil === escritorio) sinRespuesta.push(`${ancho}×${alto}`);
      }
    }

    expect(sinRespuesta.slice(0, 10), sinRespuesta.slice(0, 10).join(', ')).toEqual([]);
  });
});

describe('La copia de CSS dice lo mismo', () => {
  const css = readFileSync(join(import.meta.dirname, '..', '..', 'index.css'), 'utf8');

  it('`movil` y `escritorio` son las mismas cadenas, carácter por carácter', () => {
    expect(css).toContain(`@media ${CONSULTA_MOVIL}`);
    expect(css).toContain(`@media ${CONSULTA_ESCRITORIO}`);
  });

  it('nadie escribió el corte a mano en otro sitio', () => {
    // Dos: la variante `movil` y el bloque de reglas del armazón. Más que eso
    // significa que alguien volvió a copiarlo, y entonces cambiarlo ya no es
    // cambiar un sitio.
    const copias = css.split('(max-width: 767px)').length - 1;
    expect(copias).toBeLessThanOrEqual(2);
  });
});

describe('Dentro de la app del teléfono', () => {
  afterEach(() => vi.unstubAllGlobals());

  // No llama a ningún gancho de React por dentro, así que se puede preguntar
  // fuera de un render: es lo que permite probarlo sin DOM.
  it('sin ventana ni puente, no', () => {
    expect(useEnLaApp()).toBe(false);
  });

  it('con la marca y el puente, sí', () => {
    vi.stubGlobal('navigator', { userAgent: `Mozilla/5.0 ${USER_AGENT_APP}0.1.0` });
    vi.stubGlobal('window', {
      webkit: { messageHandlers: { cocoSesion: { postMessage: () => Promise.resolve() } } },
    });
    expect(useEnLaApp()).toBe(true);
  });

  it('con la marca pero sin puente, no', () => {
    vi.stubGlobal('navigator', { userAgent: `Mozilla/5.0 ${USER_AGENT_APP}0.1.0` });
    vi.stubGlobal('window', {});
    expect(useEnLaApp()).toBe(false);
  });
});
