// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { Select } from '@/shared/ui/organisms/select';

import { Field } from './field';
import { Input } from './input';
import { Textarea } from './textarea';

afterEach(cleanup);

/**
 * The floating label is a state machine split between CSS and React,
 * and both halves break without making noise.
 *
 * What is checked here is what the CSS needs the markup to give it:
 * the order of the siblings, the placeholder attribute that makes
 * `:placeholder-shown` work, and the `data-` with which a dropdown says whether it has
 * something selected. The position and size of the label are CSS and jsdom does not
 * compute them; what can be required is that the hooks exist, because without
 * them the label stays down covering a value or up over an empty
 * field, and both look equally bad.
 */
describe('The field with a floating label', () => {
  it('puts the control BEFORE the label', () => {
    // The order matters: the `.field` selectors in `index.css` look for the
    // label as `> label` inside a box that already contains the control.
    // With the label first, the markup still reads the same and none of
    // the rules match.
    const { container } = render(
      <Field label="Concepto" id="c">
        <Input id="c" />
      </Field>,
    );

    const box = container.querySelector('.field');
    expect(box).not.toBeNull();
    expect(box?.children).toHaveLength(2);
    expect(box?.children[0]!.tagName).toBe('INPUT');
    expect(box?.children[1]!.tagName).toBe('LABEL');
  });

  it('ties the label to the control', () => {
    const { container } = render(
      <Field label="Concepto" id="my-field">
        <Input id="my-field" />
      </Field>,
    );

    expect(container.querySelector('label')?.getAttribute('for')).toBe('my-field');
    expect(container.querySelector('input')?.id).toBe('my-field');
  });

  it('a text field ALWAYS has a placeholder, even if nobody passes one', () => {
    // It is what makes `:placeholder-shown` work. Without the attribute, the
    // selector never matches and the label stays up from the
    // start, over an empty field.
    const { container } = render(<Input />);
    expect(container.querySelector('input')?.getAttribute('placeholder')).toBe(' ');

    cleanup();
    const withOwn = render(<Input placeholder="dd/mm/aaaa" />);
    expect(withOwn.container.querySelector('input')?.getAttribute('placeholder')).toBe(
      'dd/mm/aaaa',
    );
  });

  it('so does a text area', () => {
    const { container } = render(<Textarea />);
    expect(container.querySelector('textarea')?.getAttribute('placeholder')).toBe(' ');
  });

  it('inside a field, the placeholder is hidden until there is focus', () => {
    // This broke once and looked like this: the label centered and the
    // placeholder eight pixels lower, crossing each other. The hiding was in the
    // stylesheet, in the `components` layer, and the field's own
    // `placeholder:text-muted-foreground` beat it.
    const inside = render(
      <Field label="Valor" id="v">
        <Input id="v" placeholder="0" />
      </Field>,
    );
    const classes = inside.container.querySelector('input')?.className ?? '';
    expect(classes).toContain('placeholder:text-transparent');
    expect(classes).toContain('focus:placeholder:text-muted-foreground');

    cleanup();

    // And outside a field there is no label in the way: the placeholder shows.
    const outside = render(<Input placeholder="Buscar…" />);
    expect(outside.container.querySelector('input')?.className).toContain(
      'placeholder:text-muted-foreground',
    );
  });

  it('a dropdown says whether something is selected, and hides its «nothing selected» if not', () => {
    const options = [{ value: '1', label: 'Arriendo' }];

    const empty = render(
      <Select
        label="Concepto"
        value=""
        emptyLabel="Sin elegir"
        options={options}
        onChange={() => {}}
      />,
    );
    expect(empty.container.querySelector('[data-filled]')?.getAttribute('data-filled')).toBe('no');
    // With `data-empty` set, the CSS hides it while the label takes its
    // place; without it both texts would show stepping on each other.
    expect(empty.container.querySelector('[data-empty]')).not.toBeNull();

    cleanup();

    const filled = render(
      <Select
        label="Concepto"
        value="1"
        emptyLabel="Sin elegir"
        options={options}
        onChange={() => {}}
      />,
    );
    expect(filled.container.querySelector('[data-filled]')?.getAttribute('data-filled')).toBe(
      'yes',
    );
    expect(filled.container.querySelector('[data-empty]')).toBeNull();
  });

  it('the text field reserves room for its icons', () => {
    const Person = () => <svg data-probe="person" />;

    const left = render(<Input icon={Person} />);
    expect(left.container.querySelector('input')?.className).toContain('pl-9');
    // `data-icon` is what shifts the label so it does not fall on top.
    expect(left.container.querySelector('[data-icon]')).not.toBeNull();

    cleanup();

    const two = render(<Input actions={[<button key="a" />, <button key="b" />]} />);
    expect(two.container.querySelector('input')?.className).toContain('pr-19');
  });
});

/** The project files, for the check that reads the code. */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return path.endsWith('.tsx') ? [path] : [];
  });
}

describe('No form puts the name above the field again', () => {
  const files = sources(join(import.meta.dirname, '..', '..', '..'));

  it('finds the project files', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('nobody uses a loose <Label> in a screen', () => {
    // `Label` still exists —`Field` uses it inside, and a checkbox or a
    // switch need it because their name goes BESIDE and not inside—, but
    // a screen that writes it is putting the name above the
    // field again, and then half the form floats and the other half does not.
    const offenders: string[] = [];

    for (const path of files) {
      const relative = path.split('/src/')[1]!;
      if (relative.startsWith('shared/ui/')) continue;

      for (const usage of readFileSync(path, 'utf8').matchAll(/<Label\b[^>]*>/g)) {
        offenders.push(`${relative}: ${usage[0].replace(/\s+/g, ' ').slice(0, 70)}`);
      }
    }

    expect(offenders, 'use Field: the label goes inside the control and floats').toEqual([]);
  });
});
