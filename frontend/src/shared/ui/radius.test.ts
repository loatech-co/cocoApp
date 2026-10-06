import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The standard radius of a container is 10px: `rounded-lg`.
 *
 * It is the theme's `--radius`, and `rounded-lg` is the class that reads it.
 * Smaller is fine where needed —a checkbox, a chip— but larger is not: two
 * neighboring containers with different corners read as two different
 * systems, and that is exactly what happened with 24px cards stuck to 16px
 * tables.
 *
 * The standard used to be `rounded-2xl` and the scale was shifted
 * —`rounded-lg` was 16 and `rounded-xl` 20, because `--radius` was 1rem—.
 * With 10px the scale grows in order again: sm 6, md 8, lg 10, xl 14. What
 * goes beyond that is Tailwind's 2xl and 3xl, which do not read the theme, and
 * that is why this test forbids them.
 *
 * It reads the source code, like the button one, because the problem is not
 * in the component but in whoever writes the class.
 */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const filePath = join(dir, entry);
    if (statSync(filePath).isDirectory()) return sourceFiles(filePath);
    return filePath.endsWith('.tsx') ? [filePath] : [];
  });
}

/** The cap, in pixels: the theme's `--radius`. */
const MAX_RADIUS_PX = 10;

/**
 * What is allowed to go over, and why.
 *
 * · `app/app-shell.tsx` — the corner of the WELL, the gap where the content
 *   opens inside the page. It carries `rounded-tl-xl`, which is 14px and is a
 *   value of the theme's scale, not a made-up number.
 *
 *   It goes over because it is the largest container there is: a 10px corner
 *   on an edge that spans the whole height of the window is barely visible,
 *   and what that corner has to tell —that the rail wraps the content instead
 *   of being stuck next to it— depends on it being seen.
 *
 *   And it does NOT break the rule this test defends, which is that two
 *   NEIGHBORING containers must not have different corners: the well is no
 *   card's neighbor, it is the background all of them rest on.
 *
 * · `shared/ui/atoms/bottom-sheet.tsx` — the two TOP corners of a sheet that
 *   rises from the bottom edge. It carries `rounded-t-[16px]`.
 *
 *   Same reason as the well and same way of not breaking the rule. The corner
 *   spans the whole width of the screen, so 10px on it is barely visible, and
 *   what it has to tell —that this is a sheet that rose and that the page is
 *   still underneath— depends on it being seen. And it has no neighbors: it
 *   is on top of everything else.
 */
const ALLOWED = new Set<string>(['app/app-shell.tsx', 'shared/ui/atoms/bottom-sheet.tsx']);

describe('No container goes over the standard radius', () => {
  const files = sourceFiles(join(import.meta.dirname, '..', '..'));

  it('finds the project files', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('there are no radii above 10px', () => {
    const offenders: string[] = [];

    for (const filePath of files) {
      const relativePath = filePath.split('/src/')[1]!;
      if (ALLOWED.has(relativePath)) continue;

      const code = readFileSync(filePath, 'utf8');

      // `xl`, `2xl` and `3xl`: the last two do not even read the theme.
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
