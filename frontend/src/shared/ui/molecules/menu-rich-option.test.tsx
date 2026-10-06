// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TrendingDown } from 'lucide-react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MenuRichOption } from './menu-rich-option';

afterEach(cleanup);

describe('MenuRichOption', () => {
  it('reads its title and help, and is chosen with a click', () => {
    const onClick = vi.fn();
    render(
      <MenuRichOption
        Icon={TrendingDown}
        color="expense"
        title="Gasto"
        description="Plata que sale"
        onClick={onClick}
      />,
    );

    const option = screen.getByRole('menuitem');
    expect(option.textContent).toContain('Plata que sale');
    fireEvent.click(option);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('shows why it is off, and cannot be chosen', () => {
    render(
      <MenuRichOption
        Icon={TrendingDown}
        color="income"
        title="Ingreso"
        description="Plata que entra"
        note="Pronto"
        disabled
      />,
    );

    const option = screen.getByRole('menuitem');
    expect(option).toHaveProperty('disabled', true);
    expect(option.textContent).toContain('Pronto');
  });
});
