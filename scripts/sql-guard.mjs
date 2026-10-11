// The guard of `npm run sql`: which statement, if any, needs --force.
//
// It looks at every statement, not at the first characters of the input: a
// file that opens with a comment or a `BEGIN;`, or a line that chains two
// statements, used to slip a DELETE past a regex anchored at the start.
// Comments are stripped first, then the text is split on the `;` that are
// outside quotes (single, double or dollar-quoted), and each piece is judged
// on its own.

const DESTRUCTIVE_HEAD = /^(DROP\s+(DATABASE|SCHEMA|TABLE)|TRUNCATE)\b/i;
const WRITE_HEAD = /^(DELETE|UPDATE)\b/i;
const WHERE = /\bWHERE\b/i;

/** A single-, double- or dollar-quoted piece at the start of the text. */
const QUOTED = /^('(?:[^']|'')*'|"(?:[^"]|"")*"|(\$[A-Za-z_]*\$)[\s\S]*?\2)/;

/** Removes line and block comments, leaving quoted text alone. */
export function stripComments(sql) {
  let out = '';
  let i = 0;
  while (i < sql.length) {
    const rest = sql.slice(i);
    const quote = rest.match(QUOTED);
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
    const quote = rest.match(QUOTED);
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

/** The first statement that needs --force, or `undefined` when none does. */
export function destructiveStatement(sql) {
  return splitStatements(stripComments(sql)).find(
    (statement) =>
      DESTRUCTIVE_HEAD.test(statement) || (WRITE_HEAD.test(statement) && !WHERE.test(statement)),
  );
}
