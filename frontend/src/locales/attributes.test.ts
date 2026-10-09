import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * No attribute a person reads or hears is written as a literal.
 *
 * `i18next/no-literal-string` (eslint.config.js) only reads JSX text: the
 * attributes are left out because most of them are classes, ids and keys.
 * The ones listed in `VISIBLE` are not: a screen reader says the
 * `aria-label`, the field shows the `placeholder`, the tooltip shows the
 * `title`. So the source is read, and any of them with a letter written as a
 * literal (`="…"`, `{'…'}`, `{"…"}`, `{`…`}`) fails unless it is in
 * `EXCEPTIONS`, with its reason. An exception nobody uses fails too.
 */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'test-support' ? [] : sourceFiles(path);
    return path.endsWith('.tsx') && !path.includes('.test.') && !path.includes('.stories.')
      ? [path]
      : [];
  });
}

const SRC = join(import.meta.dirname, '..');
const relative = (path: string): string => path.split('/src/')[1]!;

const VISIBLE = [
  'aria-label',
  'aria-description',
  'aria-roledescription',
  'aria-valuetext',
  'placeholder',
  'title',
  'alt',
  'label',
];

const ATTRIBUTE = new RegExp(
  `(?<![\\w-])(${VISIBLE.join('|')})=(?:"([^"]*)"|\\{'([^']*)'\\}|\\{"([^"]*)"\\}|\\{\`([^\`]*)\`\\})`,
  'g',
);

const EXCEPTIONS: { file: string; text: string; reason: string }[] = [
  {
    file: 'shared/ui/atoms/logo.tsx',
    text: 'Coco',
    reason: 'The brand: it is the name of the app, not a text to translate',
  },
];

function literals(source: string): { attribute: string; text: string }[] {
  return [...source.matchAll(ATTRIBUTE)].map((m) => ({
    attribute: m[1]!,
    text: m[2] ?? m[3] ?? m[4] ?? m[5] ?? '',
  }));
}

describe('visible attributes', () => {
  it('reads every literal form and skips what is not text', () => {
    const found = literals(
      `<a aria-label="Cerrar" title={'Ayuda'} placeholder={"buscar"} alt={\`foto\`} />` +
        `<b data-label="x" aria-labelledby="id" alt="" placeholder="0" label={t('k')} />`,
    ).filter((l) => /\p{L}/u.test(l.text));
    expect(found.map((l) => l.text)).toEqual(['Cerrar', 'Ayuda', 'buscar', 'foto']);
  });

  it('none with letters is written outside the catalog', () => {
    const files = sourceFiles(SRC);
    expect(files.length).toBeGreaterThan(50);
    const used = new Set<number>();
    const violations: string[] = [];
    for (const path of files) {
      const file = relative(path);
      for (const { attribute, text } of literals(readFileSync(path, 'utf8'))) {
        if (!/\p{L}/u.test(text)) continue;
        const index = EXCEPTIONS.findIndex((e) => e.file === file && e.text === text);
        if (index >= 0) used.add(index);
        else violations.push(`${file} ${attribute}="${text}"`);
      }
    }
    expect(violations, 'Move them to es.json and read them with t').toEqual([]);
    expect(
      EXCEPTIONS.filter((_, i) => !used.has(i)).map((e) => `${e.file} «${e.text}»`),
      'Exceptions nobody needs any more',
    ).toEqual([]);
  });
});
