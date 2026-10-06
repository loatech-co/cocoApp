/**
 * No new Spanish names in the code (step 7.2-a, docs/standards/rename-plan.md
 * «The lint»).
 *
 * What it reads: every name DECLARED in TypeScript/JavaScript under `api/`,
 * `frontend/`, `packages/`, `scripts/` and `e2e/`, and in Swift under `ios/`
 * (variables, parameters, functions, classes, types, members, object keys),
 * plus every file and folder name there. A name is split into words
 * (camelCase, PascalCase, snake_case, kebab-case), accents are stripped
 * (`categoría` → `categoria`) and it fails if a word is in SPANISH_WORDS.
 *
 * What it does NOT read, in this first version: strings, comments and test
 * titles. Visible text lives in the catalogs (`es.json`,
 * `Localizable.xcstrings`, step 7.3); comments and titles are the «P» half of
 * every 7.2 slice and a review item until then.
 *
 * The baseline (`spanish-identifiers.baseline.json`) is what was Spanish when
 * the lint arrived, per folder and with a count per name. A name passes while
 * its folder still has that many; one more fails. Each 7.2 slice renames its
 * folder and removes its part, so the file only shrinks, and 7.10 deletes it.
 *
 *   npx tsx scripts/lint/spanish-identifiers.ts            check
 *   npx tsx scripts/lint/spanish-identifiers.ts --update   rewrite the baseline
 *   npx tsx scripts/lint/spanish-identifiers.ts --against <git ref>
 *       also fail if the baseline holds more of any name than at <ref> (CI)
 *
 * A stale entry (the baseline expects more than there is) fails too: the
 * baseline has to say exactly what is left, or a slice cannot prove it ended.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import ts from 'typescript';

import { SPANISH_WORDS } from './spanish-words.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const BASELINE = 'scripts/lint/spanish-identifiers.baseline.json';
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
    if (!isCode && !isSwift) continue;
    let text: string;
    try {
      text = readFileSync(path.join(ROOT, file), 'utf8');
    } catch {
      continue; // deleted in the working tree, not yet staged
    }
    const names = isSwift ? swiftNames(text) : declaredNames(file, text);
    for (const { name, line } of names) {
      if (spanishIn(name).length > 0) hits.push({ folder, entry: name, where: `${file}:${line}` });
    }
  }
  return hits;
}

type Baseline = Record<string, Record<string, number>>;

function count(hits: Hit[]): Baseline {
  const result: Baseline = {};
  for (const { folder, entry } of hits) {
    result[folder] ??= {};
    result[folder][entry] = (result[folder][entry] ?? 0) + 1;
  }
  const sorted: Baseline = {};
  for (const folder of Object.keys(result).sort()) {
    sorted[folder] = {};
    for (const entry of Object.keys(result[folder]).sort())
      sorted[folder][entry] = result[folder][entry];
  }
  return sorted;
}

function totalsByName(baseline: Baseline): Map<string, number> {
  const totals = new Map<string, number>();
  for (const entries of Object.values(baseline)) {
    for (const [entry, n] of Object.entries(entries))
      totals.set(entry, (totals.get(entry) ?? 0) + n);
  }
  return totals;
}

function readBaseline(): Baseline {
  try {
    return JSON.parse(readFileSync(path.join(ROOT, BASELINE), 'utf8')) as Baseline;
  } catch {
    return {};
  }
}

/** The baseline may move between folders (a slice renames one) but never grow. */
function grewSince(ref: string, current: Baseline): string[] {
  let before: Baseline;
  try {
    const text = execFileSync('git', ['show', `${ref}:${BASELINE}`], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    before = JSON.parse(text) as Baseline;
  } catch {
    console.log(`No baseline at ${ref}: nothing to compare (the lint arrives with this change).`);
    return [];
  }
  const was = totalsByName(before);
  const problems: string[] = [];
  for (const [entry, n] of totalsByName(current)) {
    const old = was.get(entry) ?? 0;
    if (n > old) problems.push(`  ${entry}: ${old} → ${n}`);
  }
  return problems;
}

function main() {
  const args = process.argv.slice(2);
  const hits = scan();
  const current = count(hits);

  if (args.includes('--update')) {
    writeFileSync(path.join(ROOT, BASELINE), `${JSON.stringify(current, null, 2)}\n`);
    const total = [...totalsByName(current).values()].reduce((a, b) => a + b, 0);
    console.log(
      `Baseline written: ${total} Spanish names in ${Object.keys(current).length} folders.`,
    );
    return;
  }

  const baseline = readBaseline();
  const failures: string[] = [];

  for (const [folder, entries] of Object.entries(current)) {
    for (const [entry, n] of Object.entries(entries)) {
      const allowed = baseline[folder]?.[entry] ?? 0;
      if (n <= allowed) continue;
      const where = hits
        .filter((h) => h.folder === folder && h.entry === entry)
        .map((h) => h.where);
      const spanish = spanishIn(entry.replace(/^(?:file|dir):/, '').replace(/\.[^.]*$/, ''));
      failures.push(
        `  ${entry} (${spanish.join(', ')}): ${n} in ${folder}, baseline allows ${allowed}\n` +
          where.map((w) => `      ${w}`).join('\n'),
      );
    }
  }
  const stale: string[] = [];
  for (const [folder, entries] of Object.entries(baseline)) {
    for (const [entry, n] of Object.entries(entries)) {
      const now = current[folder]?.[entry] ?? 0;
      if (now < n) stale.push(`  ${folder}: ${entry} (baseline ${n}, now ${now})`);
    }
  }

  const against = args.indexOf('--against');
  const grew = against >= 0 ? grewSince(args[against + 1], baseline) : [];

  if (failures.length > 0) {
    console.error(
      `New Spanish names (code is in English; docs/standards/rename-plan.md):\n${failures.join('\n')}`,
    );
  }
  if (stale.length > 0) {
    console.error(
      `The baseline expects names that are gone. Good: shrink it with\n` +
        `  npm run lint:spanish -- --update\n${stale.join('\n')}`,
    );
  }
  if (grew.length > 0) {
    console.error(`The baseline grew (it may only shrink):\n${grew.join('\n')}`);
  }
  if (failures.length + stale.length + grew.length > 0) process.exit(1);
  const total = [...totalsByName(baseline).values()].reduce((a, b) => a + b, 0);
  console.log(
    `No new Spanish names. Baseline: ${total} left in ${Object.keys(baseline).length} folders.`,
  );
}

main();
