import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { markupNamesInCode, markupNamesInCss } from './spanish-markup.ts';

// The probes are English on purpose: this reads WHICH names the markup
// carries; whether one is Spanish is `spanish-words.ts`'s business.
const names = (file: string, text: string) => markupNamesInCode(file, text).map((f) => f.name);

describe('spanish-markup: the names a TypeScript file carries in its markup and keys', () => {
  it('reads data-* attributes, ids and their references, in JSX and in strings', () => {
    const found = markupNamesInCode(
      'x.tsx',
      [
        "const a = <div data-state={open ? 'open' : 'closed'} id=\"side-panel\" />;",
        'const b = <label htmlFor={`field-${n}`} aria-controls="listing" />;',
        'page.locator(\'[data-row="first"]\');',
      ].join('\n'),
    );
    assert.deepEqual(
      found.map((f) => [f.name, f.line]),
      [
        ['state', 1],
        ['open', 1],
        ['closed', 1],
        ['side-panel', 1],
        ['field', 2],
        ['listing', 2],
        ['row', 3],
        ['first', 3],
      ],
    );
  });

  it('reads a dataset access and what a dataset assignment stores (round 4, W4)', () => {
    assert.deepEqual(names('x.ts', "el.dataset.state = 'open'; if (el.dataset.seen) {}").sort(), [
      'open',
      'seen',
      'state',
    ]);
  });

  it('reads cache keys: queryKey, a *Keys object and the query-client calls', () => {
    assert.deepEqual(
      names(
        'x.ts',
        [
          "useQuery({ queryKey: ['movements', id] });",
          "const movementKeys = { all: ['listing'] as const };",
          "client.setQueryData(['balances'], data);",
        ].join('\n'),
      ),
      ['movements', 'listing', 'balances'],
    );
  });

  it('reads storage keys, except the legacy ones still read to migrate them (round 4, W4)', () => {
    assert.deepEqual(
      names(
        'x.ts',
        [
          "localStorage.getItem('saved-key');",
          "localStorage.setItem('other-key', '1');",
          "sessionStorage.removeItem('old-key');",
          "localStorage.getItem('sidenav-plegada');",
        ].join('\n'),
      ),
      ['saved-key', 'other-key', 'old-key'],
    );
  });

  it('survives a storage or key call without arguments, and skips comments', () => {
    assert.deepEqual(
      names('x.ts', "storage.getItem(); client.invalidateQueries();\n// data-remark='yes'"),
      [],
    );
  });

  it('reads class, id and data-* selectors of a stylesheet, not numbers, files or comments', () => {
    assert.deepEqual(
      markupNamesInCss(
        [
          '/* .remark #skipped */',
          '.card > #header:hover { margin: 0.5rem; src: url(font.woff) }',
          '[data-state="open"] { }',
        ].join('\n'),
      ).map((f) => [f.name, f.line]),
      [
        ['card', 2],
        ['header', 2],
        ['state', 3],
        ['open', 3],
      ],
    );
  });
});
