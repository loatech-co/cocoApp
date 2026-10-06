// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { PageHeader, PAGE_TITLE } from './page-header';

// This file stays `.ts` because CLAUDE.md names it by path; the render tests
// below build their elements with `createElement` for that reason.
describe('CabeceraDePagina', () => {
  afterEach(cleanup);

  it('renders the one level-1 heading of the screen, inside a banner', () => {
    render(
      createElement(PageHeader, {
        title: 'Movimientos',
        description: 'Lo que entró y salió.',
        beside: createElement('span', null, 'Beta'),
        actions: createElement('button', { type: 'button' }, 'Registrar'),
      }),
    );

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Movimientos' })).toBeTruthy();
    expect(screen.getByRole('banner').textContent).toContain('Lo que entró y salió.');
    expect(screen.getByRole('button', { name: 'Registrar' })).toBeTruthy();
    expect(screen.getByText('Beta').parentElement).toBe(
      screen.getByRole('heading', { level: 1 }).parentElement,
    );
  });

  it('leaves the help line out when there is none, and keeps the rule', () => {
    render(createElement(PageHeader, { title: 'Perfil', align: 'bottom' }));

    const banner = screen.getByRole('banner');
    expect(banner.querySelector('p')).toBeNull();
    expect(banner.className).toContain('border-b');
    expect(banner.className).toContain('items-end');
  });
});

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
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return path.endsWith('.tsx') ? [path] : [];
  });
}

const root = join(import.meta.dirname, '..', '..', '..');
const files = sources(root).filter((r) => !r.endsWith('page-header.tsx'));
const relative = (path: string): string => path.split('/src/')[1]!;

/**
 * El contenido de `acciones={…}`, contando llaves.
 *
 * Hace falta contarlas porque dentro hay JSX con sus propias llaves —un
 * `onClick={() => …}`, un `aria-label={…}`— y cortar en la primera `}` dejaría
 * fuera justo el botón que hay que comprobar.
 */
function actionBlocks(code: string): string[] {
  const blocks: string[] = [];
  // `actions` is the page header's; `acciones` is still the modal header's
  // until its own slice renames it (7.2-k). Both are checked, as before.
  const OPENING = /\b(?:actions|acciones)=\{/g;

  for (const match of code.matchAll(OPENING)) {
    const from = match.index;
    let level = 0;
    let i = from + match[0].length - 1;

    for (; i < code.length; i += 1) {
      if (code[i] === '{') level += 1;
      else if (code[i] === '}') {
        level -= 1;
        if (level === 0) break;
      }
    }

    blocks.push(code.slice(from, i + 1));
  }

  return blocks;
}

describe('La cabecera de una pantalla se dibuja en un solo sitio', () => {
  it('encuentra los archivos del proyecto', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('ninguna pantalla escribe su propio título de nivel 1', () => {
    // Se permiten dos formas, y solo dos: la clase compartida —para una
    // pantalla que no es una cabecera, como el 404— y un `sr-only`, que no
    // pinta nada y existe para que la página tenga jerarquía.
    const offenders: string[] = [];

    for (const path of files) {
      const code = readFileSync(path, 'utf8');
      for (const usage of code.matchAll(/<h1[^>]*>/g)) {
        const tag = usage[0];
        if (tag.includes('PAGE_TITLE') || tag.includes('sr-only')) continue;
        offenders.push(`${relative(path)}: ${tag}`);
      }
    }

    expect(
      offenders,
      'usa CabeceraDePagina, o su clase TITULO_DE_PAGINA si no es una cabecera',
    ).toEqual([]);
  });

  it('la acción de una cabecera mide `sm`', () => {
    // El tamaño por defecto del botón es `md` (44px), así que un `<Button>` sin
    // `size` dentro de `acciones` es exactamente el error que se acaba de
    // corregir: la misma acción medía 44 en Centros de costos y 36 en el
    // resumen, donde la pone el `Menu`.
    const offenders: string[] = [];

    for (const path of files) {
      for (const block of actionBlocks(readFileSync(path, 'utf8'))) {
        for (const usage of block.matchAll(/<Button\b[^>]*>/g)) {
          if (/size="sm(-icon)?"/.test(usage[0])) continue;
          offenders.push(`${relative(path)}: ${usage[0].replace(/\s+/g, ' ').slice(0, 80)}`);
        }
      }
    }

    expect(offenders, 'una acción de cabecera lleva size="sm"').toEqual([]);
  });

  it('la clase del título trae familia, peso y el escalón de la pantalla', () => {
    expect(PAGE_TITLE).toContain('font-display');
    expect(PAGE_TITLE).toContain('font-semibold');
    expect(PAGE_TITLE).toContain('text-2xl');
    expect(PAGE_TITLE).toContain('sm:text-3xl');
    // El interletraje lo declara el tema en cero y Geist ya viene cerrada.
    expect(PAGE_TITLE).not.toContain('tracking-');
  });
});
