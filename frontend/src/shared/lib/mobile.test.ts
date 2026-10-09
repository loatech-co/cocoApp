import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { USER_AGENT_APP } from '@/shared/lib/native-contract';

import { DESKTOP_QUERY, MOBILE_QUERY, useIsInNativeApp } from './mobile';

/**
 * The two queries have to be COMPLEMENTARY.
 *
 * A size that fell in both would paint the rail and the bottom bar at once;
 * one that fell in neither would be left without navigation. Written by hand,
 * neither problem shows when reading: they show when testing.
 *
 * That is why this test brings a minimal evaluator —it only understands
 * `max-width`, `min-width` and `orientation`, which is all these two strings
 * use— and sweeps a grid of real sizes.
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
          // The CSS definition: portrait is height GREATER THAN OR EQUAL to
          // width. A square is portrait.
          return value === 'portrait' ? height >= width : width > height;
        }

        const px = Number(value!.replace('px', ''));
        if (feature === 'max-width') return width <= px;
        if (feature === 'min-width') return width >= px;
        throw new Error(`No sé evaluar: ${condition}`);
      }),
  );
}

/** Real devices, not round numbers. */
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

describe('The breakpoint between phone and desktop', () => {
  it.each(DEVICES)('%s falls where it should', (_name, width, height, isMobile) => {
    expect(evaluate(MOBILE_QUERY, width, height)).toBe(isMobile);
    expect(evaluate(DESKTOP_QUERY, width, height)).toBe(!isMobile);
  });

  it('no size falls in both or in neither', () => {
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

describe('The CSS copy says the same', () => {
  const css = readFileSync(join(import.meta.dirname, '..', '..', 'index.css'), 'utf8');

  it('`movil` and `escritorio` are the same strings, character by character', () => {
    expect(css).toContain(`@media ${MOBILE_QUERY}`);
    expect(css).toContain(`@media ${DESKTOP_QUERY}`);
  });

  it('nobody wrote the breakpoint by hand somewhere else', () => {
    // Two: the `movil` variant and the shell's block of rules. More than that
    // means someone copied it again, and then changing it is no longer
    // changing one place.
    const copies = css.split('(max-width: 767px)').length - 1;
    expect(copies).toBeLessThanOrEqual(2);
  });
});

describe('Inside the phone app', () => {
  afterEach(() => vi.unstubAllGlobals());

  // It calls no React hook inside, so it can be asked outside a render: that
  // is what lets it be tested without a DOM.
  it('without a window or a bridge, no', () => {
    expect(useIsInNativeApp()).toBe(false);
  });

  it('with the mark and the bridge, yes', () => {
    vi.stubGlobal('navigator', { userAgent: `Mozilla/5.0 ${USER_AGENT_APP}0.1.0` });
    vi.stubGlobal('window', {
      webkit: { messageHandlers: { cocoSession: { postMessage: () => Promise.resolve() } } },
    });
    expect(useIsInNativeApp()).toBe(true);
  });

  it('with the mark but without a bridge, no', () => {
    vi.stubGlobal('navigator', { userAgent: `Mozilla/5.0 ${USER_AGENT_APP}0.1.0` });
    vi.stubGlobal('window', {});
    expect(useIsInNativeApp()).toBe(false);
  });
});
