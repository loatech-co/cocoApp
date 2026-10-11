import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  destructiveStatement,
  splitStatements,
  stripComments,
  withoutQuotes,
} from './sql-guard.mjs';

const stops = (sql, expected = sql) => assert.equal(destructiveStatement(sql), expected);
const passes = (sql) => assert.equal(destructiveStatement(sql), undefined);

describe('the guard of npm run sql', () => {
  it('lets reads and bounded writes through', () => {
    passes('SELECT 1');
    passes("DELETE FROM t WHERE id = 'x'");
    passes('UPDATE t SET a = 1 WHERE b = 2');
    passes('DELETE FROM t WHERE id IN (SELECT id FROM u WHERE x) RETURNING id');
  });

  it('stops a DELETE or UPDATE without WHERE, and DROP or TRUNCATE', () => {
    stops('DELETE FROM t');
    stops('update t set a = 1');
    stops('TRUNCATE t');
    stops('DROP TABLE t');
  });

  it('is not fooled by a leading comment', () => {
    stops('-- cleanup\nDELETE FROM t', 'DELETE FROM t');
    stops('/* cleanup */ TRUNCATE t', 'TRUNCATE t');
  });

  it('nor by BEGIN; or a second statement on the same line', () => {
    stops('BEGIN; DELETE FROM t; COMMIT;', 'DELETE FROM t');
    stops('SELECT 1; DROP TABLE t', 'DROP TABLE t');
  });

  it('nor by a WHERE that belongs to another statement', () => {
    stops('SELECT 1 WHERE true; DELETE FROM t', 'DELETE FROM t');
  });

  it('nor by a write hidden in a CTE, with or without a WHERE of its own (S14)', () => {
    stops('WITH x AS (DELETE FROM t) SELECT * FROM x WHERE true');
    stops('WITH x AS (UPDATE t SET a = 1) SELECT 1');
    passes('WITH x AS (DELETE FROM t WHERE a = 1) SELECT * FROM x');
  });

  it('nor by a WHERE that is a literal, or belongs to a subquery (S14)', () => {
    stops("DELETE FROM t RETURNING 'WHERE'");
    stops('DELETE FROM t USING (SELECT id FROM u WHERE x) s');
    stops('UPDATE t SET a = (SELECT max(b) FROM u WHERE c)');
  });

  it('nor by a DROP that is not at the head of the statement (S14)', () => {
    stops('ALTER TABLE t DROP COLUMN c');
    stops('DROP INDEX i');
    stops('DROP VIEW v');
    stops('DROP ROLE r');
    stops('DROP FUNCTION f()');
    stops('CREATE TABLE a (id int); TRUNCATE b', 'TRUNCATE b');
  });

  it('nor by a DO block whose body writes (S14)', () => {
    stops('DO $$ BEGIN DELETE FROM t; END $$');
    stops('DO $body$ BEGIN EXECUTE format(%L, 1); TRUNCATE t; END $body$');
    stops('DO $$ BEGIN PERFORM 1; DROP TABLE t; END $$');
    passes("DO $$ BEGIN RAISE NOTICE 'DELETE FROM t'; END $$");
    passes('DO $$ BEGIN PERFORM count(*) FROM t; END $$');
  });

  it('knows a clause from a statement', () => {
    passes('CREATE TABLE a (b int REFERENCES c ON DELETE CASCADE ON UPDATE CASCADE)');
    passes('SELECT * FROM t FOR UPDATE');
    passes('INSERT INTO t (id) VALUES (1) ON CONFLICT (id) DO UPDATE SET id = 1');
    passes('GRANT SELECT, UPDATE, DELETE ON t TO r');
    passes('REVOKE DELETE ON t FROM r');
    passes('CREATE TRIGGER x AFTER UPDATE OR DELETE ON t EXECUTE FUNCTION f()');
    passes('CREATE POLICY p ON t FOR DELETE TO r USING (true)');
  });

  it('leaves quoted text alone', () => {
    assert.equal(stripComments("SELECT '--not a comment' -- real"), "SELECT '--not a comment' ");
    assert.deepEqual(splitStatements("SELECT 'a;b'; SELECT $$x;y$$"), [
      "SELECT 'a;b'",
      'SELECT $$x;y$$',
    ]);
    passes("SELECT 'DELETE FROM t'");
    passes('SELECT "delete" FROM t');
    assert.equal(withoutQuotes('SELECT \'a\', "b", $$c$$ FROM t'), 'SELECT  ,  ,   FROM t');
    assert.equal(withoutQuotes("DO $$ x 'y' z $$", true).replace(/\s+/g, ' '), 'DO x z ');
  });

  it('reads an escape string, where a backslash-quote does not end it (S20)', () => {
    assert.deepEqual(splitStatements("SELECT E'a\\';b'; SELECT 1"), [
      "SELECT E'a\\';b'",
      'SELECT 1',
    ]);
    assert.equal(withoutQuotes("SELECT E'it\\'s; DELETE FROM t' FROM t"), 'SELECT   FROM t');
    passes("SELECT E'\\'; DELETE FROM t'");
    assert.deepEqual(splitStatements("SELECT x LIKE'a\\'; DELETE FROM t"), [
      "SELECT x LIKE'a\\'",
      'DELETE FROM t',
    ]);
  });
});
