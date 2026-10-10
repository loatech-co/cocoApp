/**
 * No new Spanish names in the code (step 7.2-a, docs/standards/rename-plan.md
 * «The lint»).
 *
 * What it reads: every name DECLARED in TypeScript/JavaScript under `api/`,
 * `frontend/`, `packages/`, `scripts/` and `e2e/`, and in Swift under `ios/`
 * (variables, parameters, functions, classes, types, members, object keys),
 * plus the `@custom-variant` names and `--*` custom properties of every
 * stylesheet, the custom properties code names (`var(--x)`, `'--x'`), and
 * every file and folder name there. A name is split into words
 * (camelCase, PascalCase, snake_case, kebab-case), accents are stripped
 * (`categoría` → `categoria`) and it fails if a word is in SPANISH_WORDS.
 *
 * What it does NOT read, in this first version: strings, comments and test
 * titles. Visible text lives in the catalogs (`es.json`,
 * `Localizable.xcstrings`, step 7.3); comments and titles are the «P» half of
 * every 7.2 slice and a review item until then.
 *
 * Any Spanish name fails, wherever it is. Until step J-6c a baseline
 * (`spanish-identifiers.baseline.json`) let through what was Spanish when the
 * lint arrived, per folder; every 7.2 slice shrank it and J-6c emptied it, so
 * it is gone and there is no exception left to hold.
 *
 *   npx tsx scripts/lint/spanish-identifiers.ts
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import ts from 'typescript';

import { SPANISH_WORDS } from './spanish-words.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const ROOTS = ['api', 'frontend', 'packages', 'scripts', 'e2e', 'ios'];

/** Words never in the list, each with its reason. */
const NOT_SPANISH: Record<string, string> = {
  el: 'the usual name for a DOM element',
  es: 'a locale code (es.json)',
  en: 'a locale code',
};

/** English words that are also Spanish: listed so nobody adds them. */
const ALSO_ENGLISH = [
  'son',
  'lo',
  'may',
  'pie',
  'combo',
  'total',
  'final',
  'real',
  'normal',
  'general',
  'actual',
  'panel',
  'chip',
  'control',
  'selector',
  'alias',
  'variables',
  'demo',
  'configurable',
  // Added in 7.2-a, when the first baseline showed them in English names
  // (`downloadedAgo`, a `PesoFormat` for the currency): month abbreviations
  // shared by both languages, and words English borrowed whole.
  'ago',
  'feb',
  'mar',
  'jun',
  'jul',
  'sep',
  'sept',
  'oct',
  'nov',
  'solo',
  'persona',
  'vista',
  'pico',
  'fin',
  'peso',
  'pesos',
];

/** Places, brands, the Colombian tax id, the currency, test personas. */
const PROPER_NOUNS = ['bogota', 'celsia', 'nit', 'cop', 'beto', 'ana', 'bruno'];

/** Paths never read, each with its reason. */
const IGNORED: { prefix: string; why: string }[] = [
  { prefix: 'api/prisma/migrations/', why: 'applied names, never renamed' },
  {
    prefix: 'api/prisma/archived-mysql-migrations/',
    why: 'applied names of the MySQL era, kept as they were (7.2-c)',
  },
  { prefix: 'frontend/src/locales/', why: 'user-visible text (7.3)' },
  { prefix: 'frontend/src/shared/api/generated/', why: 'written by Orval from openapi.v2.json' },
  { prefix: 'api/src/generated/', why: 'written by prisma generate' },
];

const CODE = /\.(?:[cm]?[jt]s|tsx|jsx)$/;

const words = new Set(SPANISH_WORDS);
for (const word of [...Object.keys(NOT_SPANISH), ...ALSO_ENGLISH, ...PROPER_NOUNS]) {
  if (words.has(word)) throw new Error(`SPANISH_WORDS lists «${word}», which is an exception.`);
}

/** `categoríaPadre_id` → ['categoria', 'padre', 'id']. */
function splitWords(name: string): string[] {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[^A-Za-z]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
}

const spanishIn = (name: string) => splitWords(name).filter((w) => words.has(w));

interface Hit {
  folder: string;
  entry: string;
  where: string;
}

// ── Names declared in TypeScript / JavaScript ──────────────────────────────

function declaredNames(file: string, text: string): { name: string; line: number }[] {
  const kind = file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, false, kind);
  const found: { name: string; line: number }[] = [];
  const add = (node: ts.Node | undefined) => {
    if (!node) return;
    let name: string | undefined;
    if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) name = node.text.replace(/^#/, '');
    else if (ts.isStringLiteral(node) && /^[A-Za-z_$][\w$-]*$/.test(node.text)) name = node.text;
    else if (ts.isObjectBindingPattern(node) || ts.isArrayBindingPattern(node)) {
      for (const element of node.elements) if (!ts.isOmittedExpression(element)) add(element.name);
      return;
    }
    if (name === undefined) return;
    const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
    found.push({ name, line });
  };
  const visit = (node: ts.Node) => {
    if (
      ts.isVariableDeclaration(node) ||
      ts.isParameter(node) ||
      ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isClassDeclaration(node) ||
      ts.isClassExpression(node) ||
      ts.isInterfaceDeclaration(node) ||
      ts.isTypeAliasDeclaration(node) ||
      ts.isEnumDeclaration(node) ||
      ts.isEnumMember(node) ||
      ts.isModuleDeclaration(node) ||
      ts.isTypeParameterDeclaration(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isMethodSignature(node) ||
      ts.isPropertyDeclaration(node) ||
      ts.isPropertySignature(node) ||
      ts.isGetAccessorDeclaration(node) ||
      ts.isSetAccessorDeclaration(node) ||
      ts.isPropertyAssignment(node) ||
      ts.isNamespaceImport(node)
    ) {
      add(node.name);
    } else if (ts.isImportClause(node)) {
      add(node.name);
    } else if (ts.isImportSpecifier(node) && node.propertyName) {
      // `import { a as b }`: `b` is chosen here; a plain import is a use.
      add(node.name);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

// ── Names declared in Swift ─────────────────────────────────────────────────

/** Comments and string literals out, line breaks kept so lines still count. */
function swiftCode(text: string): string {
  const blank = (s: string) => s.replace(/[^\n]/g, ' ');
  return text
    .replace(/"""[\s\S]*?"""/g, blank)
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/\/\/[^\n]*/g, blank)
    .replace(/"(?:\\.|[^"\\\n])*"/g, blank);
}

const SWIFT_DECLARATION =
  /\b(?:func|var|let|class|struct|enum|protocol|typealias|actor|associatedtype|for)\s+([A-Za-z_]\w*)/g;
/** An enum's `case a, b(String)`; a switch's `case .a:` ends in a colon and is a use. */
const SWIFT_CASES = /^[ \t]*(?:indirect[ \t]+)?case[ \t]+([^:\n]*)$/gm;
const SWIFT_PARAMETERS = /\b(?:func\s+\w+|init)\s*(?:<[^>]*>)?\s*\(([^)]*)\)/g;

function swiftNames(text: string): { name: string; line: number }[] {
  const code = swiftCode(text);
  const lineOf = (index: number) => code.slice(0, index).split('\n').length;
  const found: { name: string; line: number }[] = [];
  for (const m of code.matchAll(SWIFT_DECLARATION))
    found.push({ name: m[1], line: lineOf(m.index) });
  for (const m of code.matchAll(SWIFT_CASES)) {
    for (const part of m[1].replace(/\([^)]*\)/g, '').split(',')) {
      const name = /^\s*([A-Za-z_]\w*)/.exec(part)?.[1];
      if (name) found.push({ name, line: lineOf(m.index) });
    }
  }
  for (const m of code.matchAll(SWIFT_PARAMETERS)) {
    for (const p of m[1].matchAll(/(?:^|,)\s*([A-Za-z_]\w*)(?:\s+([A-Za-z_]\w*))?\s*:/g)) {
      found.push({ name: p[1], line: lineOf(m.index) });
      if (p[2]) found.push({ name: p[2], line: lineOf(m.index) });
    }
  }
  return found;
}

/**
 * The Tailwind variants declared in a stylesheet (`@custom-variant mobile`):
 * every class that uses one carries its name (`mobile:min-h-[42px]`), so a
 * Spanish name there spreads to every call.
 */
const CSS_VARIANT = /@custom-variant\s+([\w-]+)/g;

/** Every custom property a stylesheet declares or reads (`--bar-gap`). */
const CSS_PROPERTY = /(?<![\w-])--([a-z][\w-]*)/gi;

/**
 * A custom property named from code: `var(--x)`, `'--x'` in a `style`, the
 * Tailwind forms `[--x:…]` and `pb-(--x)`. Only those openings, so a CLI flag
 * in a comment is not taken for one.
 */
const CODE_PROPERTY = /(?:var\(|['"`[(])--([a-z][\w-]*)/gi;

function matchedNames(text: string, pattern: RegExp): { name: string; line: number }[] {
  return [...text.matchAll(pattern)].map((match) => ({
    name: match[1]!,
    line: text.slice(0, match.index).split('\n').length,
  }));
}

function cssNames(text: string): { name: string; line: number }[] {
  return [...matchedNames(text, CSS_VARIANT), ...matchedNames(text, CSS_PROPERTY)];
}

// ── The scan ────────────────────────────────────────────────────────────────

function trackedFiles(): string[] {
  const out = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', ...ROOTS],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  return out
    .split('\0')
    .filter(Boolean)
    .filter((file) => !IGNORED.some((i) => file.startsWith(i.prefix)));
}

function scan(): Hit[] {
  const hits: Hit[] = [];
  const seenDirs = new Set<string>();
  for (const file of trackedFiles()) {
    const folder = path.posix.dirname(file);
    // Folder names, each once.
    const parts = file.split('/');
    for (let i = 1; i < parts.length; i++) {
      const dir = parts.slice(0, i).join('/');
      if (seenDirs.has(dir)) continue;
      seenDirs.add(dir);
      if (spanishIn(parts[i - 1]).length > 0) {
        hits.push({
          folder: parts.slice(0, i - 1).join('/') || '.',
          entry: `dir:${parts[i - 1]}`,
          where: dir,
        });
      }
    }
    // The file name, extension out.
    const base = path.posix.basename(file);
    const stem = base.includes('.') ? base.slice(0, base.lastIndexOf('.')) : base;
    if (spanishIn(stem).length > 0) hits.push({ folder, entry: `file:${base}`, where: file });

    const isCode = CODE.test(file);
    const isSwift = file.endsWith('.swift');
    const isCss = file.endsWith('.css');
    if (!isCode && !isSwift && !isCss) continue;
    let text: string;
    try {
      text = readFileSync(path.join(ROOT, file), 'utf8');
    } catch {
      continue; // deleted in the working tree, not yet staged
    }
    const names = isCss
      ? cssNames(text)
      : isSwift
        ? swiftNames(text)
        : [...declaredNames(file, text), ...matchedNames(text, CODE_PROPERTY)];
    for (const { name, line } of names) {
      if (spanishIn(name).length > 0) hits.push({ folder, entry: name, where: `${file}:${line}` });
    }
  }
  return hits;
}

function main() {
  const hits = scan();
  if (hits.length > 0) {
    const lines = hits.map(({ entry, where }) => {
      const spanish = spanishIn(entry.replace(/^(?:file|dir):/, '').replace(/\.[^.]*$/, ''));
      return `  ${entry} (${spanish.join(', ')}): ${where}`;
    });
    console.error(
      `Spanish names (code is in English; docs/standards/rename-plan.md):\n${lines.join('\n')}`,
    );
    process.exit(1);
  }
  console.log('No Spanish names.');
}

main();
