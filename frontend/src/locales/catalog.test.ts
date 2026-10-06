import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import inventory from './es.inventory.json';
import es from './es.json';

/**
 * The catalog keeps every text the web had before it existed (step 7.3).
 *
 * `es.inventory.json` was generated from the source BEFORE the texts moved:
 * every string a person could read, written as it was, with what the code
 * filled in (`${name}`, `{total}`) reduced to `{{}}`. Moving ~700 strings by
 * hand or by script is where a tilde, a closing quote or the space before an
 * interpolation gets lost, and nothing else would notice: the DOM tests look
 * for a handful of them, the journeys for fewer.
 *
 * A text can change, on purpose: change it in `es.json` AND here, in the same
 * commit, and the diff says it was meant.
 */
interface Tree {
  [key: string]: string | Tree;
}

function entries(tree: Tree, prefix = ''): [string, string][] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === 'string'
      ? [[`${prefix}${key}`, value] as [string, string]]
      : entries(value, `${prefix}${key}.`),
  );
}

const catalog = entries(es);
/** Placeholders are named by whoever writes the key; the text around them is what must hold. */
const shape = (text: string): string => text.replace(/\{\{[^}]*\}\}/g, '{{}}');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !/\.(test|stories)\.tsx?$/.test(name) ? [path] : [];
  });
}

describe('es.json, the catalog of the web', () => {
  it('still says, character by character, every text the web said before it', () => {
    const said = new Set(catalog.map(([, value]) => shape(value)));
    const lost = inventory.filter((text) => !said.has(text));

    expect(lost, 'changed or lost in the move to the catalog').toEqual([]);
  });

  it('has no text nobody reads', () => {
    const code = sources(join(import.meta.dirname, '..'))
      .map((path) => readFileSync(path, 'utf8'))
      .join('\n');
    const unused = catalog.map(([key]) => key).filter((key) => !code.includes(`'${key}'`));

    expect(unused, 'keys no screen asks for: delete them or use them').toEqual([]);
  });

  it('only uses the interpolation it knows how to fill', () => {
    // i18next reads `count` and `context` as plurals and variants, and `$t(`
    // as a nested key. A text that happens to contain them would not render
    // as written.
    const risky = catalog.filter(
      ([, value]) => /\{\{\s*(count|context)\s*\}\}/.test(value) || value.includes('$t('),
    );

    expect(risky).toEqual([]);
  });
});
