// The guard of `npm run sql`: which statement, if any, needs --force.
//
// It looks at every statement, not at the first characters of the input: a
// file that opens with a comment or a `BEGIN;`, or a line that chains two
// statements, used to slip a DELETE past a regex anchored at the start.
// Comments are stripped first, then the text is split on the `;` that are
// outside quotes (single, double or dollar-quoted), and each piece is judged
// on its own, WITHOUT its quoted text: a `RETURNING 'WHERE'` is not a WHERE,
// and a `SELECT 'DELETE FROM t'` deletes nothing.
//
// What needs --force (round 4, S14):
//   · DROP or TRUNCATE anywhere in a statement (`ALTER TABLE t DROP COLUMN`,
//     `DROP INDEX`, `DROP ROLE`…), not only at its head;
//   · DELETE or UPDATE anywhere (`WITH x AS (DELETE …) SELECT`) without a
//     WHERE at ITS OWN nesting level: a WHERE inside a subquery, or one that
//     belongs to the outer SELECT, does not bound it;
//   · a DO block whose body carries any of the four: the body is code, not
//     a literal, even though it travels dollar-quoted.
// A keyword that is not a statement of its own —`ON DELETE CASCADE`,
// `FOR UPDATE`, `ON CONFLICT DO UPDATE`, `GRANT DELETE`, `AFTER UPDATE`— is
// told apart by the word before it. Doubt errs towards asking for --force.

const DESTRUCTIVE = /\b(DELETE|UPDATE|TRUNCATE|DROP)\b/i;
const WRITE = new Set(['DELETE', 'UPDATE']);

/** The word before a keyword that makes it a clause, not a statement. */
const CLAUSE_LEADERS = new Set([
  'DO', // ON CONFLICT DO UPDATE
  'FOR', // SELECT … FOR UPDATE; CREATE POLICY … FOR DELETE
  'ON', // ON DELETE CASCADE, ON UPDATE
  'BEFORE', // CREATE TRIGGER … BEFORE DELETE
  'AFTER',
  'OF', // INSTEAD OF DELETE
  'OR', // INSERT OR UPDATE
  'GRANT', // GRANT DELETE, UPDATE ON …
  'REVOKE',
  ',',
]);

/** A single-, double- or dollar-quoted piece at the start of the text. */
const QUOTED = /^('(?:[^']|'')*'|"(?:[^"]|"")*"|(\$[A-Za-z_]*\$)([\s\S]*?)\2)/;
/** An escape string, `E'…'`, where `\'` does not close it. */
const ESCAPE_QUOTED = /^[eE]'(?:[^'\\]|\\[\s\S]|'')*'/;

/**
 * The quoted piece that starts at `i`, or null. An `E` that is the tail of a
 * word (`LIKE'x'`) is not the escape prefix: that is a plain string after a
 * keyword.
 */
function quotedAt(sql, i) {
  const rest = sql.slice(i);
  const afterWord = i > 0 && /\w/.test(sql[i - 1]);
  return (afterWord ? null : rest.match(ESCAPE_QUOTED)) ?? rest.match(QUOTED);
}

/** Removes line and block comments, leaving quoted text alone. */
export function stripComments(sql) {
  let out = '';
  let i = 0;
  while (i < sql.length) {
    const rest = sql.slice(i);
    const quote = quotedAt(sql, i);
    if (quote) {
      out += quote[0];
      i += quote[0].length;
    } else if (rest.startsWith('--')) {
      const end = rest.indexOf('\n');
      i = end === -1 ? sql.length : i + end;
    } else if (rest.startsWith('/*')) {
      const end = rest.indexOf('*/');
      i = end === -1 ? sql.length : i + end + 2;
    } else {
      out += sql[i];
      i += 1;
    }
  }
  return out;
}

/** Splits on `;` outside quotes; empty pieces are dropped. */
export function splitStatements(sql) {
  const statements = [];
  let current = '';
  let i = 0;
  while (i < sql.length) {
    const rest = sql.slice(i);
    const quote = quotedAt(sql, i);
    if (quote) {
      current += quote[0];
      i += quote[0].length;
    } else if (sql[i] === ';') {
      statements.push(current);
      current = '';
      i += 1;
    } else {
      current += sql[i];
      i += 1;
    }
  }
  statements.push(current);
  return statements.map((s) => s.trim()).filter((s) => s.length > 0);
}

/**
 * The statement without its quoted text, each piece replaced by a space.
 * With `openDollar`, a dollar-quoted body is kept (minus ITS quoted text):
 * that is how the code of a DO block is read.
 */
export function withoutQuotes(sql, openDollar = false) {
  let out = '';
  let i = 0;
  while (i < sql.length) {
    const quote = quotedAt(sql, i);
    if (quote) {
      out += openDollar && quote[2] ? ` ${withoutQuotes(quote[3])} ` : ' ';
      i += quote[0].length;
    } else {
      out += sql[i];
      i += 1;
    }
  }
  return out;
}

/** The last non-space token (word or single character) before `index`. */
function wordBefore(text, index) {
  const before = text.slice(0, index).trimEnd();
  const match = before.match(/([A-Za-z_]\w*|\S)$/);
  return match ? match[1].toUpperCase() : '';
}

/** Whether a WHERE follows `from` at the same parenthesis depth, before that level closes. */
function hasOwnWhere(text, from) {
  let depth = 0;
  const token = /\(|\)|\bWHERE\b/gi;
  token.lastIndex = from;
  for (let match = token.exec(text); match; match = token.exec(text)) {
    if (match[0] === '(') depth += 1;
    else if (match[0] === ')') {
      depth -= 1;
      if (depth < 0) return false;
    } else if (depth === 0) return true;
  }
  return false;
}

/** Whether one statement (already split, comments gone) needs --force. */
export function isDestructive(statement) {
  const text = withoutQuotes(statement);
  if (/^DO\b/i.test(text.trimStart())) return DESTRUCTIVE.test(withoutQuotes(statement, true));
  const every = new RegExp(DESTRUCTIVE.source, 'gi');
  for (let match = every.exec(text); match; match = every.exec(text)) {
    const keyword = match[1].toUpperCase();
    if (CLAUSE_LEADERS.has(wordBefore(text, match.index))) continue;
    if (!WRITE.has(keyword)) return true;
    if (!hasOwnWhere(text, match.index + keyword.length)) return true;
  }
  return false;
}

/** The first statement that needs --force, or `undefined` when none does. */
export function destructiveStatement(sql) {
  return splitStatements(stripComments(sql)).find(isDestructive);
}
