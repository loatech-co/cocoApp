import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { FLOATING_SURFACE } from './surface';

/**
 * Everything that floats is drawn the same way.
 *
 * This rule had already been broken once without anyone breaking it on
 * purpose: ten files —the two date pickers, the menu, the three modals, the
 * toast, the two chart tooltips and the phone panel— repeated the same pair of
 * classes, so the day the theme changed there were ten places to update and
 * zero got updated.
 *
 * It reads the source code, like the button and radius ones, because the
 * problem is not in the component but in whoever writes the class.
 */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const filePath = join(dir, entry);
    if (statSync(filePath).isDirectory()) return sourceFiles(filePath);
    return filePath.endsWith('.tsx') ? [filePath] : [];
  });
}

const files = sourceFiles(join(import.meta.dirname, '..', '..', '..'));

const relativePath = (filePath: string): string => filePath.split('/src/')[1]!;

/**
 * Who may write the shadow without going through the surface, and why.
 *
 * The difference is between LIFTING and FLOATING. A surface that floats brings
 * its own color, its ink, its shadow and its edge, and it is those four
 * decisions together that have to be in a single place. A shadow alone on
 * something that ALREADY has color is not a surface: it is an object of the
 * page lifting for a moment —a card while it is dragged, the round button of
 * the bar—, and forcing it to bring a dropdown's background would turn it into
 * something else.
 *
 * The tooltip is here because it is INVERTED on purpose: it is the page's ink
 * acting as background, and the reason is written in its own file.
 */
const LIFTED = new Set([
  'shared/ui/atoms/tile.tsx',
  'shared/ui/atoms/bar-slot.tsx',
  'shared/ui/atoms/tooltip.tsx',
]);

describe('The surface of what floats lives in a single place', () => {
  it('finds the project files', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('nobody writes the floating shadow by hand again', () => {
    const offenders = files
      .filter((filePath) => !LIFTED.has(relativePath(filePath)))
      // The CLASS, not the mention: a comment explaining the difference
      // between what rests and what floats names the shadow without using it.
      .filter((filePath) =>
        readFileSync(filePath, 'utf8').includes('shadow-[var(--sombra-flotante)]'),
      )
      .map(relativePath);

    expect(offenders, 'use FLOATING_SURFACE from shared/ui/foundations/surface.ts').toEqual([]);
  });

  it('nobody separates a panel with a made-up black or white', () => {
    // `ring-black/5` on a white popover gives #f2f2f2: two points of
    // difference from the canvas, that is, no edge at all. The theme's border
    // is computed to show against its own surfaces, in both modes.
    const offenders: string[] = [];

    for (const filePath of files) {
      const code = readFileSync(filePath, 'utf8');
      for (const match of code.matchAll(/\b(?:ring|border)-(?:black|white)\/\d+/g)) {
        offenders.push(`${relativePath(filePath)}: ${match[0]}`);
      }
    }

    expect(offenders, 'use ring-border, or a theme token').toEqual([]);
  });

  it('the surface brings color, ink, shadow and edge', () => {
    // All four, because all four have been forgotten at some point: eight of
    // the ten places did not declare `text-popover-foreground` and inherited
    // the page's ink, which in another theme need not match.
    expect(FLOATING_SURFACE).toContain('bg-popover');
    expect(FLOATING_SURFACE).toContain('text-popover-foreground');
    expect(FLOATING_SURFACE).toContain('--sombra-flotante');
    expect(FLOATING_SURFACE).toContain('ring-border');
  });
});
