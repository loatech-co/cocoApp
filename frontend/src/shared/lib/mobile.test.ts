import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { USER_AGENT_APP } from '@/shared/lib/native-contract';

import { DESKTOP_QUERY, MOBILE_QUERY, useIsInNativeApp } from './mobile';

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
function evaluate(query: string, width: number, height: number): boolean {
  return query.split(',').some((branch) =>
    branch
      .split(' and ')
      .map((c) => c.trim())
      .every((condition) => {
        const [, feature, value] = /^\(([a-z-]+):\s*(.+)\)$/.exec(condition) ?? [];
        if (!feature) throw new Error(`No sé evaluar: ${condition}`);

        if (feature === 'orientation') {
          // La definición de CSS: vertical es alto MAYOR O IGUAL que ancho. Un
          // cuadrado es vertical.
          return value === 'portrait' ? height >= width : width > height;
        }

        const px = Number(value!.replace('px', ''));
        if (feature === 'max-width') return width <= px;
        if (feature === 'min-width') return width >= px;
        throw new Error(`No sé evaluar: ${condition}`);
      }),
  );
}

/** Aparatos de verdad, no números redondos. */
const DEVICES: [name: string, width: number, height: number, isMobile: boolean][] = [
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
  it.each(DEVICES)('%s cae donde debe', (_name, width, height, isMobile) => {
    expect(evaluate(MOBILE_QUERY, width, height)).toBe(isMobile);
    expect(evaluate(DESKTOP_QUERY, width, height)).toBe(!isMobile);
  });

  it('ningún tamaño cae en las dos ni en ninguna', () => {
    const unanswered: string[] = [];

    for (let width = 200; width <= 2000; width += 1) {
      for (const height of [width - 1, width, width + 1, 400, 900, 1400]) {
        if (height < 1) continue;
        const isMobile = evaluate(MOBILE_QUERY, width, height);
        const isDesktop = evaluate(DESKTOP_QUERY, width, height);
        if (isMobile === isDesktop) unanswered.push(`${width}×${height}`);
      }
    }

    expect(unanswered.slice(0, 10), unanswered.slice(0, 10).join(', ')).toEqual([]);
  });
});

describe('La copia de CSS dice lo mismo', () => {
  const css = readFileSync(join(import.meta.dirname, '..', '..', 'index.css'), 'utf8');

  it('`movil` y `escritorio` son las mismas cadenas, carácter por carácter', () => {
    expect(css).toContain(`@media ${MOBILE_QUERY}`);
    expect(css).toContain(`@media ${DESKTOP_QUERY}`);
  });

  it('nadie escribió el corte a mano en otro sitio', () => {
    // Dos: la variante `movil` y el bloque de reglas del armazón. Más que eso
    // significa que alguien volvió a copiarlo, y entonces cambiarlo ya no es
    // cambiar un sitio.
    const copies = css.split('(max-width: 767px)').length - 1;
    expect(copies).toBeLessThanOrEqual(2);
  });
});

describe('Dentro de la app del teléfono', () => {
  afterEach(() => vi.unstubAllGlobals());

  // No llama a ningún gancho de React por dentro, así que se puede preguntar
  // fuera de un render: es lo que permite probarlo sin DOM.
  it('sin ventana ni puente, no', () => {
    expect(useIsInNativeApp()).toBe(false);
  });

  it('con la marca y el puente, sí', () => {
    vi.stubGlobal('navigator', { userAgent: `Mozilla/5.0 ${USER_AGENT_APP}0.1.0` });
    vi.stubGlobal('window', {
      webkit: { messageHandlers: { cocoSesion: { postMessage: () => Promise.resolve() } } },
    });
    expect(useIsInNativeApp()).toBe(true);
  });

  it('con la marca pero sin puente, no', () => {
    vi.stubGlobal('navigator', { userAgent: `Mozilla/5.0 ${USER_AGENT_APP}0.1.0` });
    vi.stubGlobal('window', {});
    expect(useIsInNativeApp()).toBe(false);
  });
});
