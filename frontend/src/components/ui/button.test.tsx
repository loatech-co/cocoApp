// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Button, buttonVariants } from './button';

const VARIANTES = [
  'default',
  'acento',
  'secondary',
  'outline',
  'ghost',
  'destructive',
  'herramienta',
] as const;

const TAMANOS = ['default', 'sm', 'lg', 'icon', 'chip', 'chip-icon', 'icon-sm'] as const;

/** Las clases que fijan el alto: `h-9`, `size-9`, `sm:size-10`… */
const alturas = (clases: string): string[] =>
  clases
    .split(/\s+/)
    .filter((c) => /^(sm:)?(h|size)-/.test(c))
    .sort();

/** Las clases que fijan el radio. */
const radios = (clases: string): string[] =>
  clases
    .split(/\s+/)
    .filter((c) => c.startsWith('rounded'))
    .sort();

describe('El botón mide lo mismo con cualquier variante', () => {
  for (const size of TAMANOS) {
    it(`tamaño ${size}: todas las variantes comparten alto y radio`, () => {
      // Esto es lo que se rompía: el alto y el radio vivían en la base, así que
      // una variante que necesitara otras esquinas los pisaba con un className
      // y de paso se llevaba el alto. En una misma barra acabaron conviviendo
      // cuatro alturas distintas.
      const referencia = buttonVariants({ variant: 'default', size });

      for (const variant of VARIANTES) {
        const clases = buttonVariants({ variant, size });
        expect(alturas(clases), `alto de ${variant}/${size}`).toEqual(alturas(referencia));
        expect(radios(clases), `radio de ${variant}/${size}`).toEqual(radios(referencia));
      }
    });
  }

  it('ninguna variante cambia el PESO de la letra', () => {
    // Dos botones del mismo alto pero con pesos distintos se leen como dos
    // tamaños: es lo que pasaba con Cancelar contra Aplicar.
    const peso = (clases: string): string[] =>
      clases.split(/\s+/).filter((c) => c.startsWith('font-')).sort();

    const referencia = peso(buttonVariants({ variant: 'default', size: 'chip' }));
    for (const variant of VARIANTES) {
      expect(peso(buttonVariants({ variant, size: 'chip' })), variant).toEqual(referencia);
    }
  });

  it('ninguna VARIANTE trae alto ni radio: eso lo decide el tamaño', () => {
    for (const variant of VARIANTES) {
      const soloVariante = buttonVariants({ variant, size: undefined })
        .split(/\s+/)
        .filter((c) => /^(sm:)?(h|size)-/.test(c) || c.startsWith('rounded'));

      // `size` sin valor cae en el por defecto, así que se compara contra él.
      const base = buttonVariants({ variant: 'default', size: undefined })
        .split(/\s+/)
        .filter((c) => /^(sm:)?(h|size)-/.test(c) || c.startsWith('rounded'));

      expect(soloVariante.sort()).toEqual(base.sort());
    }
  });

  it('Cancelar y Aplicar del calendario salen con el mismo alto', () => {
    // El par exacto que se veía descuadrado.
    const { getByText } = render(
      <>
        <Button variant="herramienta" size="sm">
          Cancelar
        </Button>
        <Button size="sm">Aplicar</Button>
      </>,
    );

    expect(alturas(getByText('Cancelar').className)).toEqual(
      alturas(getByText('Aplicar').className),
    );
    expect(radios(getByText('Cancelar').className)).toEqual(
      radios(getByText('Aplicar').className),
    );
  });
});
