import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * This test does not look at the component: it looks at WHO USES IT.
 *
 * The test next door proves that every variant comes out of the same height,
 * and even so mismatched buttons kept showing up. This was missing: a
 * `className` in a stray call overrides what the component decides, and it is
 * invisible to any test that only looks at `buttonVariants`.
 *
 * If a new measurement is needed, a `size` is added in button.tsx. Writing it
 * in the call is what left four heights living side by side in the same bar.
 */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return path.endsWith('.tsx') ? [path] : [];
  });
}

/** The classes a call can NOT set: they belong to the button's size. */
const FORBIDDEN = /\b(h-\d|h-\[|size-\d|size-\[|py-\d|py-\[|rounded(-[a-z0-9[]|\b))/;

/**
 * `flex-1` neither, and it is a case apart from the height.
 *
 * It does not break the height: it breaks the HIERARCHY. The three modal footers there were
 * had it on both buttons, so they split the width in half; in the
 * transaction sheet, which reaches 1024px, each one measured 480 and «Cancelar»
 * weighed exactly the same as «Registrar». A button the size of its text
 * says which is the primary action without having to shout it.
 *
 * `w-full` is allowed, and it is not a contradiction: stretching a button to the WHOLE
 * width of a narrow column —the «Iniciar sesión» of a 384px card, or
 * a stacked footer on a phone— is a different decision from splitting the
 * width with the button next to it. In the first case there is nobody to compete with.
 */
const STRETCHES = /\bflex-1\b/;

/**
 * Where a `<Button …>` tag ends.
 *
 * ── Why a regular expression is not enough ──────────────────────────────────
 * It was `\/<Button\\b[\\s\\S]*?>\/`, which cuts at the first `>`. And in JSX the first
 * `>` of a tag is almost never its own: it is the one of the arrow of an
 * `onClick={() => …}`. So the test captured «<Button type="button"
 * onClick={() =>», found no `className` inside, and skipped that
 * call SILENTLY.
 *
 * Since most of the buttons in this app carry an arrow before their
 * `className`, what was actually being checked was a minority. It is the
 * same bug the size list of the test next door had: a
 * check that does not measure what it says it measures warns about nothing.
 *
 * So the braces are counted. Inside `{…}` goes JavaScript —with its
 * arrows, its objects and its strings— and the `>` that closes the tag is the
 * first one that appears with the counter at zero.
 */
function tagEnd(code: string, from: number): number {
  let braces = 0;
  let quote: string | null = null;

  for (let i = from; i < code.length; i += 1) {
    const c = code[i];

    if (quote !== null) {
      if (c === quote && code[i - 1] !== '\\') quote = null;
      continue;
    }

    if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === '{') braces += 1;
    else if (c === '}') braces -= 1;
    else if (c === '>' && braces === 0) return i;
  }

  return code.length;
}

describe("Nobody changes a button's size from outside (continued)", () => {
  it('can find the end of a tag with an arrow inside', () => {
    // The exact case that slipped through.
    const code = '<Button onClick={() => x()} className="a">';
    expect(code.slice(0, tagEnd(code, 0) + 1)).toContain('className');
  });
});

describe("Nobody changes a button's size from outside", () => {
  const files = sources(join(import.meta.dirname, '..', '..', '..'));

  /** The classes of each `<Button … >` in the project, with their file. */
  function classesOfEachCall(): { path: string; classes: string }[] {
    const output: { path: string; classes: string }[] = [];

    for (const path of files) {
      const code = readFileSync(path, 'utf8');

      for (const opening of code.matchAll(/<Button\b/g)) {
        const tag = code.slice(opening.index, tagEnd(code, opening.index) + 1);
        const className = /className=(?:"([^"]*)"|\{cn\(([\s\S]*?)\)\})/.exec(tag);
        if (!className) continue;
        output.push({ path: path.split('/src/')[1]!, classes: className[1] ?? className[2] ?? '' });
      }
    }

    return output;
  }

  it('finds the project files', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('finds calls with className to inspect', () => {
    // Without this, any change in the expression that looks for them would leave the two
    // checks below passing on nothing.
    expect(classesOfEachCall().length).toBeGreaterThan(5);
  });

  it('no <Button> call carries height, vertical padding or radius', () => {
    const offenders = classesOfEachCall()
      .filter(({ classes }) => FORBIDDEN.test(classes))
      .map(({ path, classes }) => `${path}: ${classes.trim().slice(0, 80)}`);

    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('no button splits the width with the one next to it', () => {
    const offenders = classesOfEachCall()
      .filter(({ classes }) => STRETCHES.test(classes))
      .map(({ path, classes }) => `${path}: ${classes.trim().slice(0, 80)}`);

    expect(
      offenders,
      'use ModalFooter: it stacks at full width on the phone and aligns right on the desktop',
    ).toEqual([]);
  });
});
