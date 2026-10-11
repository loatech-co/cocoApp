/**
 * The names `spanish-identifiers.ts` reads from markup, stylesheets and cache
 * keys (round 3, finding W4): `lint:spanish` only read declared names, so a
 * Spanish `data-*` attribute, class selector, `id` or `queryKey` went through
 * for months.
 *
 * - `data-*` attributes: the name and its literal values, in JSX
 *   (`data-x={a ? 'y' : 'n'}` included), in CSS selectors, in any string (a
 *   Playwright locator) and in a `dataset.x` read.
 * - `id`, `htmlFor` and the `aria-*` references to an id: their literal
 *   values (the head of a template too).
 * - Stylesheets: class selectors (`.x`) and id selectors (`#x`).
 * - Cache keys: every string in a `queryKey`, in a `keys` / `*Keys` object
 *   and in the first argument of the query-client calls that take a key.
 *
 * It walks the syntax tree, so comments are not read: they are the «P» half
 * of every slice, like in `spanish-identifiers.ts`.
 */
import ts from 'typescript';

export interface Found {
  name: string;
  line: number;
}

/** `data-x`, `data-x='y'`, `[data-x="y"]`, inside a string or a stylesheet. */
const DATA_ATTRIBUTE = /\bdata-([a-z][\w-]*)(?:\s*=\s*['"]([\w-]+)['"])?/g;
const ID_ATTRIBUTES = new Set([
  'id',
  'htmlFor',
  'aria-labelledby',
  'aria-describedby',
  'aria-controls',
]);
const KEY_OBJECT = /^keys$|Keys$/;
const KEY_CALLS = new Set([
  'setQueryData',
  'getQueryData',
  'getQueryState',
  'invalidateQueries',
  'removeQueries',
  'refetchQueries',
  'cancelQueries',
]);
const IDENTIFIER_LIKE = /^[A-Za-z_][\w-]*$/;

function matched(text: string, pattern: RegExp, lineAt: (index: number) => number): Found[] {
  const found: Found[] = [];
  for (const match of text.matchAll(pattern)) {
    for (const group of match.slice(1)) {
      if (group) found.push({ name: group, line: lineAt(match.index) });
    }
  }
  return found;
}

const isLiteral = (n: ts.Node): n is ts.StringLiteral | ts.NoSubstitutionTemplateLiteral =>
  ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n);

/** What a TypeScript / JavaScript file carries in its markup and keys. */
export function markupNamesInCode(file: string, text: string): Found[] {
  const kind = file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, false, kind);
  const found: Found[] = [];
  const lineOf = (n: ts.Node) => source.getLineAndCharacterOfPosition(n.getStart(source)).line + 1;
  const push = (name: string, at: ts.Node) => {
    if (IDENTIFIER_LIKE.test(name)) found.push({ name, line: lineOf(at) });
  };
  /** The string literals and template heads under a node. */
  const literalsUnder = (node: ts.Node) => {
    const visit = (n: ts.Node) => {
      if (isLiteral(n)) push(n.text, n);
      else if (ts.isTemplateHead(n)) push(n.text.replace(/-$/, ''), n);
      ts.forEachChild(n, visit);
    };
    visit(node);
  };
  const visit = (node: ts.Node) => {
    if (ts.isJsxAttribute(node)) {
      const name = ts.isIdentifier(node.name) ? node.name.text : node.name.getText(source);
      if (name.startsWith('data-')) {
        push(name.slice('data-'.length), node);
        if (node.initializer) literalsUnder(node.initializer);
      } else if (ID_ATTRIBUTES.has(name) && node.initializer) {
        literalsUnder(node.initializer);
      }
    } else if (ts.isPropertyAssignment(node) && node.name.getText(source) === 'queryKey') {
      literalsUnder(node.initializer);
    } else if (ts.isVariableDeclaration(node) && node.initializer) {
      if (ts.isIdentifier(node.name) && KEY_OBJECT.test(node.name.text)) {
        literalsUnder(node.initializer);
      }
    } else if (ts.isCallExpression(node) && node.arguments.length > 0) {
      const callee = node.expression;
      if (ts.isPropertyAccessExpression(callee) && KEY_CALLS.has(callee.name.text)) {
        literalsUnder(node.arguments[0]!);
      }
    } else if (ts.isPropertyAccessExpression(node)) {
      const owner = node.expression;
      if (ts.isPropertyAccessExpression(owner) && owner.name.text === 'dataset') {
        push(node.name.text, node);
      }
    } else if (isLiteral(node) || ts.isTemplateLiteralToken(node)) {
      found.push(...matched(node.text, DATA_ATTRIBUTE, () => lineOf(node)));
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

const CSS_COMMENT = /\/\*[\s\S]*?\*\//g;
/** `.x` as a selector (not `0.5rem`, not `font.woff`). */
const CSS_CLASS = /(?<![\w-])\.([a-z_][\w-]*)/g;
/** `#x` as a selector: what follows it is a combinator, a pseudo or the block. */
const CSS_ID = /(?<![\w-])#([a-z_][\w-]*)(?=[\s,{:[.>+~)])/g;

/** What a stylesheet carries in its selectors. */
export function markupNamesInCss(text: string): Found[] {
  const code = text.replace(CSS_COMMENT, (c) => c.replace(/[^\n]/g, ' '));
  const lineAt = (index: number) => code.slice(0, index).split('\n').length;
  return [
    ...matched(code, CSS_CLASS, lineAt),
    ...matched(code, CSS_ID, lineAt),
    ...matched(code, DATA_ATTRIBUTE, lineAt),
  ];
}
