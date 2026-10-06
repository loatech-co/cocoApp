// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { Wallet } from 'lucide-react';
import { afterEach, describe, expect, it } from 'vitest';

import { IconChip } from './icon-chip';

afterEach(cleanup);

describe('IconChip', () => {
  it.each([
    ['expense', 'gasto'],
    ['income', 'ingreso'],
    ['budget', 'presupuesto'],
    ['transactions', 'movimientos'],
  ] as const)('takes the %s color and its ink from the theme, by role', (color, token) => {
    const { container } = render(<IconChip Icon={Wallet} color={color} />);

    const chip = container.firstElementChild as HTMLElement;
    expect(chip.style.backgroundColor).toBe(`var(--chip-${token})`);
    expect(chip.style.color).toBe(`var(--chip-${token}-tinta)`);
  });

  it('is decorative', () => {
    const { container } = render(<IconChip Icon={Wallet} color="expense" />);

    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('shrinks the chip and the icon together in the small size', () => {
    const { container } = render(<IconChip Icon={Wallet} color="expense" size="sm" />);

    expect(container.firstElementChild!.className).toContain('size-9');
    expect(container.querySelector('svg')?.getAttribute('class')).toContain('size-4');
  });
});
