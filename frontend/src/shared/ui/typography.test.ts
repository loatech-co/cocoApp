import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Two typography rules that break by themselves, and so are watched.
 *
 * It reads the source code, like the button, radius and floating surface
 * ones: the problem is not in a component but in whoever writes the class,
 * and a hand-written class goes unseen by everyone until there are fifteen.
 */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const filePath = join(dir, entry);
    if (statSync(filePath).isDirectory()) return sourceFiles(filePath);
    return filePath.endsWith('.tsx') ? [filePath] : [];
  });
}

const files = sourceFiles(join(import.meta.dirname, '..', '..'));
const relativePath = (filePath: string): string => filePath.split('/src/')[1]!;

describe('Typography comes from the scale and does not shout', () => {
  it('finds the project files', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('no label goes in sustained capitals', () => {
    // A word in small caps loses the silhouette that makes it recognizable:
    // "Soporte" and "SOPORTE" are not read equally fast. They were on the
    // label of the summary indicators and on the section group of the rail,
    // which are exactly the places read out of the corner of the eye.
    const offenders: string[] = [];

    // The bare word, and not a whole `className=`: the class shows up just as
    // often inside a `cn(...)` with single quotes, and an expression that
    // tries to cover both forms falls short on the third. Here «uppercase»
    // can only be the Tailwind utility —this project's comments say
    // «sustained capitals»—, so searching for it plainly is enough.
    //
    // With one exception: `first-letter:uppercase` is NOT shouting, it is
    // capitalizing an initial. What this rule forbids is the bare utility,
    // the one that puts a whole label in small caps; hence the `(?<![-:\w])`,
    // which discards any variant preceding it.
    for (const filePath of files) {
      for (const line of readFileSync(filePath, 'utf8').split('\n')) {
        if (/(?<![-:\w])uppercase\b/.test(line)) {
          offenders.push(`${relativePath(filePath)}: ${line.trim()}`);
        }
      }
    }

    expect(offenders, 'use lowercase; the size and the gray already say it is a label').toEqual([]);
  });

  it('no font size is written in pixels', () => {
    // `text-[11px]` was in thirteen places and they had already drifted
    // apart: some with `leading-none` and some without. The scale has a step
    // for that, `text-2xs`, declared in `index.css` with its line height.
    const offenders: string[] = [];

    for (const filePath of files) {
      const code = readFileSync(filePath, 'utf8');
      for (const match of code.matchAll(/\btext-\[\d+(?:\.\d+)?(?:px|rem)\]/g)) {
        offenders.push(`${relativePath(filePath)}: ${match[0]}`);
      }
    }

    expect(offenders, 'use the scale: text-2xs, text-xs, text-sm…').toEqual([]);
  });
});
