// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { PageHeader, PAGE_TITLE } from './page-header';

// This file stays `.ts` because CLAUDE.md names it by path; the render tests
// below build their elements with `createElement` for that reason.
describe('PageHeader', () => {
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
 * A screen's header is drawn in a single place.
 *
 * This rule already broke on its own once and not through anyone's carelessness in
 * particular: eight screens wrote their title by hand and THREE
 * different typographies came out. They were unified, and on the way back there was still a
 * ninth —the 404— with its own.
 *
 * It reads the source code, like the ones for buttons, radius, surface and
 * typography, because the problem is not in the component but in whoever decides
 * not to use it.
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
 * The content of `actions={…}`, counting braces.
 *
 * Counting them is needed because inside there is JSX with its own braces —an
 * `onClick={() => …}`, an `aria-label={…}`— and cutting at the first `}` would leave
 * out exactly the button that has to be checked.
 */
function actionBlocks(code: string): string[] {
  const blocks: string[] = [];
  // The page header and the modal header both call the slot `actions`.
  const OPENING = /\bactions=\{/g;

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

describe("A screen's header is drawn in a single place", () => {
  it('finds the project files', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('no screen writes its own level-1 heading', () => {
    // Two forms are allowed, and only two: the shared class —for a
    // screen that is not a header, like the 404— and an `sr-only`, which
    // paints nothing and exists so that the page has a hierarchy.
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

  it('a header action is `sm`', () => {
    // The default button size is `md` (44px), so a `<Button>` without
    // `size` inside `actions` is exactly the bug that was just
    // fixed: the same action measured 44 in Cost centers and 36 in the
    // dashboard, where the `Menu` sets it.
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

  it('the title class carries family, weight and the screen step', () => {
    expect(PAGE_TITLE).toContain('font-display');
    expect(PAGE_TITLE).toContain('font-semibold');
    expect(PAGE_TITLE).toContain('text-2xl');
    expect(PAGE_TITLE).toContain('sm:text-3xl');
    // The theme declares letter spacing as zero and Geist already comes tight.
    expect(PAGE_TITLE).not.toContain('tracking-');
  });
});
