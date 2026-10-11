import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { destructiveStatement, splitStatements, stripComments } from './sql-guard.mjs';

describe('the guard of npm run sql', () => {
  it('lets reads and bounded writes through', () => {
    assert.equal(destructiveStatement('SELECT 1'), undefined);
    assert.equal(destructiveStatement("DELETE FROM t WHERE id = 'x'"), undefined);
    assert.equal(destructiveStatement('UPDATE t SET a = 1 WHERE b = 2'), undefined);
  });

  it('stops a DELETE or UPDATE without WHERE, and DROP or TRUNCATE', () => {
    assert.equal(destructiveStatement('DELETE FROM t'), 'DELETE FROM t');
    assert.equal(destructiveStatement('update t set a = 1'), 'update t set a = 1');
    assert.equal(destructiveStatement('TRUNCATE t'), 'TRUNCATE t');
    assert.equal(destructiveStatement('DROP TABLE t'), 'DROP TABLE t');
  });

  it('is not fooled by a leading comment', () => {
    assert.equal(destructiveStatement('-- cleanup\nDELETE FROM t'), 'DELETE FROM t');
    assert.equal(destructiveStatement('/* cleanup */ TRUNCATE t'), 'TRUNCATE t');
  });

  it('nor by BEGIN; or a second statement on the same line', () => {
    assert.equal(destructiveStatement('BEGIN; DELETE FROM t; COMMIT;'), 'DELETE FROM t');
    assert.equal(destructiveStatement('SELECT 1; DROP TABLE t'), 'DROP TABLE t');
  });

  it('nor by a WHERE that belongs to another statement', () => {
    assert.equal(destructiveStatement('SELECT 1 WHERE true; DELETE FROM t'), 'DELETE FROM t');
  });

  it('leaves quoted text alone', () => {
    assert.equal(stripComments("SELECT '--not a comment' -- real"), "SELECT '--not a comment' ");
    assert.deepEqual(splitStatements("SELECT 'a;b'; SELECT $$x;y$$"), [
      "SELECT 'a;b'",
      'SELECT $$x;y$$',
    ]);
    assert.equal(destructiveStatement("SELECT 'DELETE FROM t'"), undefined);
  });
});
