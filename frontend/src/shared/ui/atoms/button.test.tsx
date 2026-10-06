// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Button, buttonVariants } from './button';

const VARIANTS = [
  'default',
  'accent',
  'secondary',
  'outline',
  'ghost',
  'link',
  'destructive',
  'tool',
  'field',
] as const;

/**
 * The TWO sizes, and their two square twins.
 *
 * There were eight —`default`, `lg`, `icon`, `chip`…— and this list kept naming
 * the old ones when they were reduced: when `cva` is given a size that no longer
 * exists, it returns the base without any height class, so the
 * checks stayed green comparing nothing against nothing. A
 * test that measures something nonexistent warns about nothing.
 */
const SIZES = ['sm', 'md', 'sm-icon', 'md-icon'] as const;

/** The classes that set the height: `h-9`, `size-9`, `sm:size-10`… */
const heights = (classes: string): string[] =>
  classes
    .split(/\s+/)
    .filter((c) => /^(sm:)?(h|size)-/.test(c))
    .sort();

/** The classes that set the radius. */
const radios = (classes: string): string[] =>
  classes
    .split(/\s+/)
    .filter((c) => c.startsWith('rounded'))
    .sort();

const weight = (classes: string): string[] =>
  classes
    .split(/\s+/)
    .filter((c) => c.startsWith('font-'))
    .sort();

describe('The button measures the same with any variant', () => {
  it('the sizes under test are the ones that exist', () => {
    // If someone adds or removes a size, this one fails before the others and says
    // exactly what happened, instead of leaving them measuring nothing.
    for (const size of SIZES) {
      expect(heights(buttonVariants({ size })), `el tamaño ${size} fija un alto`).not.toHaveLength(
        0,
      );
    }
  });

  for (const size of SIZES) {
    it(`size ${size}: every variant shares height and radius`, () => {
      // This is what used to break: the height and the radius lived in the base, so
      // a variant that needed other corners overrode them with a className
      // and took the height along with it. In the same bar four different
      // heights ended up living side by side.
      const reference = buttonVariants({ variant: 'default', size });

      for (const variant of VARIANTS) {
        const classes = buttonVariants({ variant, size });
        expect(heights(classes), `alto de ${variant}/${size}`).toEqual(heights(reference));
        expect(radios(classes), `radio de ${variant}/${size}`).toEqual(radios(reference));
      }
    });
  }

  it('no ACTION variant changes the font weight', () => {
    // Two buttons of the same height but with different weights read as two
    // sizes: it is what happened with Cancelar against Aplicar.
    //
    // `field` is left out on purpose, and it is the only one: it is not an action but a
    // field —the date picker—, and what it shows is a VALUE. A value in
    // semibold inside a row of fields weighs more than the label that
    // names it, and the row reads backwards.
    const actionVariants = VARIANTS.filter((v) => v !== 'field');
    const reference = weight(buttonVariants({ variant: 'default', size: 'sm' }));

    for (const variant of actionVariants) {
      expect(weight(buttonVariants({ variant, size: 'sm' })), variant).toEqual(reference);
    }
  });

  it('no VARIANT carries height or radius: the size decides that', () => {
    for (const variant of VARIANTS) {
      const variantOnly = buttonVariants({ variant, size: undefined })
        .split(/\s+/)
        .filter((c) => /^(sm:)?(h|size)-/.test(c) || c.startsWith('rounded'));

      // `size` without a value falls back to the default, so it is compared against it.
      const base = buttonVariants({ variant: 'default', size: undefined })
        .split(/\s+/)
        .filter((c) => /^(sm:)?(h|size)-/.test(c) || c.startsWith('rounded'));

      expect(variantOnly.sort()).toEqual(base.sort());
    }
  });

  it("the calendar's Cancelar and Aplicar come out at the same height", () => {
    // The exact pair that looked misaligned.
    const { getByText } = render(
      <>
        <Button variant="tool" size="sm">
          Cancelar
        </Button>
        <Button size="sm">Aplicar</Button>
      </>,
    );

    expect(heights(getByText('Cancelar').className)).toEqual(
      heights(getByText('Aplicar').className),
    );
    expect(radios(getByText('Cancelar').className)).toEqual(radios(getByText('Aplicar').className));
  });
});

describe('Button', () => {
  afterEach(cleanup);

  it('is a button named by its text that reports a click', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Guardar</Button>);

    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(onClick).toHaveBeenCalledOnce();
  });

  it('takes its name from aria-label when it only shows an icon', () => {
    render(
      <Button size="sm-icon" aria-label="Cerrar">
        <svg aria-hidden="true" />
      </Button>,
    );

    expect(screen.getByRole('button', { name: 'Cerrar' })).toBeTruthy();
  });

  it('does not report clicks while disabled', () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Guardar
      </Button>,
    );

    const button = screen.getByRole<HTMLButtonElement>('button', { name: 'Guardar' });
    fireEvent.click(button);

    expect(button.disabled).toBe(true);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('never draws a focus ring: a button holds nothing to point at', () => {
    for (const variant of VARIANTS) {
      expect(buttonVariants({ variant }), variant).not.toMatch(/focus-visible:ring/);
    }
  });

  it('lends its look to the child it wraps, without adding a button', () => {
    render(
      <Button asChild variant="outline">
        <a href="/perfil">Perfil</a>
      </Button>,
    );

    const link = screen.getByRole('link', { name: 'Perfil' });
    expect(link.className).toBe(buttonVariants({ variant: 'outline' }));
    expect(screen.queryByRole('button')).toBeNull();
  });
});
