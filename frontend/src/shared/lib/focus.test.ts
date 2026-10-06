import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Focus is PAINTED when asked for, and never before.
 *
 * It is a rule nobody breaks head-on: nobody writes «light this field up when
 * the sheet opens». It is broken with an `autoFocus` added to save a click and
 * with a `focus:` written out of habit where `focus-visible:` belonged, and
 * the result is the same in both cases —a screen that opens with something
 * lit that nobody chose—. That is why the source code is read.
 *
 * What the rule does NOT say is where the cursor is. A panel traps focus
 * inside itself even though it paints nothing; a field lifts its label as
 * soon as there is a cursor in it, whoever put it there. What is forbidden
 * is the SIGNAL: the ring, the tinted border, the green label.
 */
function sourceFiles(dir: string, ext: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path, ext);
    return path.endsWith(ext) && !path.includes('.test.') ? [path] : [];
  });
}

const SRC = join(import.meta.dirname, '..', '..');
const components = sourceFiles(SRC, '.tsx');
/*
  Focus classes are also written in `.ts` files without markup:
  `FIELD_FOCUS` lives in `shared/ui/foundations/field.ts`. The two tests of
  the signal look at both kinds of file; the ones about focus that moves by
  itself look only at components, which is where something gets mounted.
*/
const withClasses = [...components, ...sourceFiles(SRC, '.ts')];
const relative = (path: string): string => path.split('/src/')[1]!;

/**
 * Who may be born focused, and why.
 *
 * The exception is not «an important field»: it is a SEARCH BOX that appears
 * because searching was asked for. There the field does not open with the
 * screen —it opens with the gesture— and asking to search and then having to
 * press the box as well are two gestures for a single intention.
 *
 * A form never qualifies. A sheet opens to be read before being filled in,
 * and the field the program decides to light up need not be the one the
 * person came to change.
 */
const BORN_FOCUSED: Record<string, string> = {
  'app/atajos.tsx': 'The page palette: it opens to type the name of one, and has no other control.',
  'features/transactions/components/toolbar-filters.tsx':
    'The search box appears on pressing the magnifier. It is the same gesture.',
  'features/transactions/components/search-panel.tsx':
    "The phone's search sheet: it rises on tapping the magnifier in the bottom bar, and the field is all it has.",
  'shared/ui/organisms/combo.tsx':
    'The filter of a dropdown with many options: if it has to be pressed before typing, nobody discovers they could filter.',
  'features/transactions/components/concept-search.tsx':
    "The sheet's concept finder: it opens to type, like a Combo's filter, and the box is the first thing inside.",
};

/**
 * `focus:` classes that are NOT the focus signal, and are therefore allowed.
 *
 * A field's placeholder appears when there is a cursor inside —no matter who
 * put it there— because at rest its place is taken by the floating label. It
 * does not say «this is focused»: it says «this goes here».
 */
const NOT_A_SIGNAL = ['focus:placeholder:text-muted-foreground'];

const css = readFileSync(join(SRC, 'index.css'), 'utf8');

/**
 * Who may draw a focus ring, and why a button is NOT one of them.
 *
 * A button is pressed and something happens: it keeps nothing and receives
 * nothing typed, so there is nothing in it to point out. And focus returns to
 * it on its own every time what it opened closes —a sheet, a dropdown—, so
 * the outline showed up on LEAVING something else, which is the opposite of
 * what a focus outline has to say.
 *
 * The ones that do keep something carry it, and the ones that cannot be
 * walked without it.
 */
const HAVE_RING: Record<string, string> = {
  'shared/ui/foundations/field.ts':
    'A field does: you need to know which one is receiving what is typed. It is `FIELD_FOCUS`, and a dropdown is a field even when it is built with a <button>.',
  'shared/ui/atoms/input.tsx': 'The error one, which goes at full ink.',
  'shared/ui/atoms/textarea.tsx': 'The error one, which goes at full ink.',
  'shared/ui/atoms/checkbox.tsx': 'A checkbox is an <input> and keeps a state.',
  'shared/ui/atoms/switch.tsx': 'A switch is an <input> and keeps a state.',
  'features/transactions/components/trend.tsx':
    'The chart enters the tab order and is walked with the arrows: without a ring, whoever arrives by keyboard does not know it is there.',
};

describe('Nothing is born focused', () => {
  it('only search boxes carry autoFocus, and they are justified', () => {
    const culprits = components
      // The attribute, not the word: the comments that explain why they do NOT
      // carry it name it between backticks, and without this they give themselves away.
      .filter((path) => /(?<!`)\bautoFocus\b(?!`)/.test(readFileSync(path, 'utf8')))
      .map(relative)
      .filter((path) => !(path in BORN_FOCUSED));

    expect(culprits, 'A field does not light up on its own: remove the `autoFocus`').toEqual([]);
  });

  it('only search boxes move focus by hand', () => {
    const culprits = components
      .filter((path) => readFileSync(path, 'utf8').includes('.focus()'))
      .map(relative)
      .filter((path) => !(path in BORN_FOCUSED));

    expect(culprits, 'Moving focus when something opens lights up what nobody chose').toEqual([]);
  });
});

describe('The focus signal is written with :focus-visible', () => {
  it('no component paints it with `focus:`', () => {
    const culprits = withClasses.flatMap((path) => {
      const found = readFileSync(path, 'utf8').match(/(?<!-visible|-within)\bfocus:[\w:[\]./-]+/g);
      return (found ?? [])
        .filter((className) => !NOT_A_SIGNAL.includes(className))
        .map((className) => `${relative(path)} → ${className}`);
    });

    expect(
      culprits,
      '`focus:` also lights up with focus the program sets. Use `focus-visible:`',
    ).toEqual([]);
  });

  it('no button draws a focus ring', () => {
    const culprits = withClasses
      .filter((path) => /focus-visible:(?:ring|border)/.test(readFileSync(path, 'utf8')))
      .map(relative)
      .filter((path) => !(path in HAVE_RING));

    expect(
      culprits,
      'A button is pressed and something happens: it keeps nothing to point out',
    ).toEqual([]);
  });

  it('and the base rule of the stylesheet exempts them from the outline', () => {
    // Without this not a single ring would have needed removing: the two-pixel
    // outline of `:focus-visible` is drawn by the base layer on ANYTHING that
    // receives focus, and it was the one showing on the add-category button.
    expect(css).toMatch(/button:focus-visible\s*\{\s*outline:\s*none/);
  });
});

describe('The floating label separates rising from tinting', () => {
  it('rises with :focus-within, because otherwise the text is overwritten', () => {
    expect(css).toContain('.campo:focus-within > label');
  });

  it('tints with :focus-visible, because that already is the signal', () => {
    expect(css).toContain('.campo:has(:focus-visible) > label');
    expect(css).not.toContain('.campo:focus-within > label {\n    color:');
  });
});
