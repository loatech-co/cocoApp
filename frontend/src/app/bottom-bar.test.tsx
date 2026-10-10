// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BottomBar } from './bottom-bar';

afterEach(cleanup);

function renderShell(extra: Partial<Parameters<typeof BottomBar>[0]> = {}) {
  const handlers = {
    onSearch: vi.fn(),
    onNewExpense: vi.fn(),
    onShortcuts: vi.fn(),
    onAccount: vi.fn(),
  };

  const vista = render(
    <MemoryRouter>
      <BottomBar
        name="Ana"
        isSearchOpen={false}
        isShortcutsOpen={false}
        isAccountOpen={false}
        {...handlers}
        {...extra}
      />
    </MemoryRouter>,
  );

  return { ...vista, ...handlers };
}

describe('The bottom bar', () => {
  it('never goes past five slots', () => {
    const { container } = renderShell();

    // Only one leads to a page. The other four raise something on top of
    // the one below, so they are buttons.
    expect(container.querySelectorAll('a')).toHaveLength(1);
    expect(container.querySelectorAll('button')).toHaveLength(4);
  });

  it('each slot carries its name, and none writes it underneath', () => {
    renderShell();

    for (const name of ['Dashboard', 'Buscar', 'Registrar un gasto', 'Atajos', 'Mi cuenta']) {
      expect(screen.getByLabelText(name)).toBeTruthy();
    }

    // Five 12px words under five drawings are a second row of text
    // competing with the page.
    expect(screen.queryByText('Dashboard')).toBeNull();
    expect(screen.queryByText('Atajos')).toBeNull();
  });

  it('the shell recognizes it', () => {
    const { container } = renderShell();
    // The `:has()` rule in index.css points at this.
    expect(container.querySelector('[data-armazon="barra"]')).toBeTruthy();
  });

  it('the (+) records an expense without going through any menu', () => {
    const { onNewExpense } = renderShell();

    const button = screen.getByLabelText('Registrar un gasto');
    expect(button.tagName).toBe('BUTTON');
    button.click();

    // A single call, not a menu to open: income does not exist yet, and
    // choosing among one option is not choosing.
    expect(onNewExpense).toHaveBeenCalledTimes(1);
  });

  it('search, shortcuts and the account raise a sheet: they do not navigate', () => {
    const { onSearch, onShortcuts, onAccount } = renderShell();

    screen.getByLabelText('Buscar').click();
    screen.getByLabelText('Atajos').click();
    screen.getByLabelText('Mi cuenta').click();

    expect(onSearch).toHaveBeenCalled();
    expect(onShortcuts).toHaveBeenCalled();
    expect(onAccount).toHaveBeenCalled();
  });

  it('the slot of what is open announces itself expanded', () => {
    renderShell({ isShortcutsOpen: true });

    expect(screen.getByLabelText('Atajos').getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByLabelText('Buscar').getAttribute('aria-expanded')).toBe('false');
  });
});
