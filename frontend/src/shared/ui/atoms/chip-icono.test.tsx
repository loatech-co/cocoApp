// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { Wallet } from 'lucide-react';
import { afterEach, describe, expect, it } from 'vitest';

import { ChipIcono } from './chip-icono';

afterEach(cleanup);

describe('ChipIcono', () => {
  it.each(['gasto', 'ingreso', 'presupuesto', 'movimientos'] as const)(
    'takes the %s colour and its ink from the theme, by role',
    (color) => {
      const { container } = render(<ChipIcono Icono={Wallet} color={color} />);

      const chip = container.firstElementChild as HTMLElement;
      expect(chip.style.backgroundColor).toBe(`var(--chip-${color})`);
      expect(chip.style.color).toBe(`var(--chip-${color}-tinta)`);
    },
  );

  it('is decorative', () => {
    const { container } = render(<ChipIcono Icono={Wallet} color="gasto" />);

    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('shrinks the chip and the icon together in the small size', () => {
    const { container } = render(<ChipIcono Icono={Wallet} color="gasto" tamano="sm" />);

    expect(container.firstElementChild!.className).toContain('size-9');
    expect(container.querySelector('svg')?.getAttribute('class')).toContain('size-4');
  });
});
