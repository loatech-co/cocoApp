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
 * Los DOS tamaños, y sus dos gemelos en cuadrado.
 *
 * Eran ocho —`default`, `lg`, `icon`, `chip`…— y esta lista se quedó nombrando
 * los viejos cuando se redujeron: al pasarle a `cva` un tamaño que ya no
 * existe, devuelve la base sin ninguna clase de alto, así que las
 * comprobaciones seguían en verde comparando el vacío contra el vacío. Una
 * prueba que mide algo inexistente no avisa de nada.
 */
const SIZES = ['sm', 'md', 'sm-icon', 'md-icon'] as const;

/** Las clases que fijan el alto: `h-9`, `size-9`, `sm:size-10`… */
const heights = (classes: string): string[] =>
  classes
    .split(/\s+/)
    .filter((c) => /^(sm:)?(h|size)-/.test(c))
    .sort();

/** Las clases que fijan el radio. */
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

describe('El botón mide lo mismo con cualquier variante', () => {
  it('los tamaños que se prueban son los que existen', () => {
    // Si alguien añade o quita un tamaño, esta falla antes que las otras y dice
    // exactamente qué pasó, en vez de dejarlas midiendo el vacío.
    for (const size of SIZES) {
      expect(heights(buttonVariants({ size })), `el tamaño ${size} fija un alto`).not.toHaveLength(
        0,
      );
    }
  });

  for (const size of SIZES) {
    it(`tamaño ${size}: todas las variantes comparten alto y radio`, () => {
      // Esto es lo que se rompía: el alto y el radio vivían en la base, así que
      // una variante que necesitara otras esquinas los pisaba con un className
      // y de paso se llevaba el alto. En una misma barra acabaron conviviendo
      // cuatro alturas distintas.
      const reference = buttonVariants({ variant: 'default', size });

      for (const variant of VARIANTS) {
        const classes = buttonVariants({ variant, size });
        expect(heights(classes), `alto de ${variant}/${size}`).toEqual(heights(reference));
        expect(radios(classes), `radio de ${variant}/${size}`).toEqual(radios(reference));
      }
    });
  }

  it('ninguna variante de ACCIÓN cambia el peso de la letra', () => {
    // Dos botones del mismo alto pero con pesos distintos se leen como dos
    // tamaños: es lo que pasaba con Cancelar contra Aplicar.
    //
    // `campo` queda fuera a propósito, y es la única: no es una acción sino un
    // campo —el selector de fecha—, y lo que enseña es un VALOR. Un valor en
    // semibold dentro de una fila de campos pesa más que la etiqueta que lo
    // nombra, y la fila se lee al revés.
    const actionVariants = VARIANTS.filter((v) => v !== 'field');
    const reference = weight(buttonVariants({ variant: 'default', size: 'sm' }));

    for (const variant of actionVariants) {
      expect(weight(buttonVariants({ variant, size: 'sm' })), variant).toEqual(reference);
    }
  });

  it('ninguna VARIANTE trae alto ni radio: eso lo decide el tamaño', () => {
    for (const variant of VARIANTS) {
      const variantOnly = buttonVariants({ variant, size: undefined })
        .split(/\s+/)
        .filter((c) => /^(sm:)?(h|size)-/.test(c) || c.startsWith('rounded'));

      // `size` sin valor cae en el por defecto, así que se compara contra él.
      const base = buttonVariants({ variant: 'default', size: undefined })
        .split(/\s+/)
        .filter((c) => /^(sm:)?(h|size)-/.test(c) || c.startsWith('rounded'));

      expect(variantOnly.sort()).toEqual(base.sort());
    }
  });

  it('Cancelar y Aplicar del calendario salen con el mismo alto', () => {
    // El par exacto que se veía descuadrado.
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
