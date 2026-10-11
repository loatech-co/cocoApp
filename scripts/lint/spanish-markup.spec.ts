import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { markupNamesInCode, markupNamesInCss } from './spanish-markup.ts';

const names = (file: string, text: string) => markupNamesInCode(file, text).map((f) => f.name);

describe('spanish-markup: the names a TypeScript file carries in its markup and keys', () => {
  it('reads data-* attributes, ids and their references, in JSX and in strings', () => {
    const found = markupNamesInCode(
      'x.tsx',
      [
        "const a = <div data-estado={open ? 'abierto' : 'cerrado'} id=\"panel-lateral\" />;",
        'const b = <label htmlFor={`campo-${n}`} aria-controls="lista" />;',
        'page.locator(\'[data-fila="primera"]\');',
      ].join('\n'),
    );
    assert.deepEqual(
      found.map((f) => [f.name, f.line]),
      [
        ['estado', 1],
        ['abierto', 1],
        ['cerrado', 1],
        ['panel-lateral', 1],
        ['campo', 2],
        ['lista', 2],
        ['fila', 3],
        ['primera', 3],
      ],
    );
  });

  it('reads a dataset access and what a dataset assignment stores (round 4, W4)', () => {
    assert.deepEqual(
      names('x.ts', "el.dataset.estado = 'abierto'; if (el.dataset.visto) {}").sort(),
      ['abierto', 'estado', 'visto'],
    );
  });

  it('reads cache keys: queryKey, a *Keys object and the query-client calls', () => {
    assert.deepEqual(
      names(
        'x.ts',
        [
          "useQuery({ queryKey: ['movimientos', id] });",
          "const movementKeys = { all: ['lista'] as const };",
          "client.setQueryData(['saldos'], data);",
        ].join('\n'),
      ),
      ['movimientos', 'lista', 'saldos'],
    );
  });

  it('reads storage keys, except the legacy ones still read to migrate them (round 4, W4)', () => {
    assert.deepEqual(
      names(
        'x.ts',
        [
          "localStorage.getItem('clave-guardada');",
          "localStorage.setItem('otra-clave', '1');",
          "sessionStorage.removeItem('vieja-clave');",
          "localStorage.getItem('sidenav-plegada');",
        ].join('\n'),
      ),
      ['clave-guardada', 'otra-clave', 'vieja-clave'],
    );
  });

  it('survives a storage or key call without arguments, and skips comments', () => {
    assert.deepEqual(
      names('x.ts', "storage.getItem(); client.invalidateQueries();\n// data-comentario='si'"),
      [],
    );
  });

  it('reads class, id and data-* selectors of a stylesheet, not numbers, files or comments', () => {
    assert.deepEqual(
      markupNamesInCss(
        [
          '/* .comentario #ignorado */',
          '.tarjeta > #cabecera:hover { margin: 0.5rem; src: url(fuente.woff) }',
          '[data-estado="abierto"] { }',
        ].join('\n'),
      ).map((f) => [f.name, f.line]),
      [
        ['tarjeta', 2],
        ['cabecera', 2],
        ['estado', 3],
        ['abierto', 3],
      ],
    );
  });
});
