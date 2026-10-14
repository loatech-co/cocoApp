// @vitest-environment jsdom
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { atWidth, testQueryClient } from '@/test-support/transaction-sheet';

import { RangePanel } from './range-panel';

afterEach(() => {
  cleanup();
  atWidth(false);
});

function openPanel(preset: 'custom' | 'this-month' = 'custom') {
  render(
    <QueryClientProvider client={testQueryClient()}>
      <RangePanel
        filters={{ preset, from: '2026-10-01', to: '2026-10-14', categoryIds: [] }}
        apply={vi.fn()}
        hasShortcuts
        close={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

describe('The range panel, on the phone', () => {
  it('puts the shortcuts in a grid of three equal columns', () => {
    atWidth(true);
    openPanel();

    const list = screen.getByRole('button', { name: 'Mes en curso' }).closest('ul')!;
    expect(list.className.split(' ')).toEqual(expect.arrayContaining(['grid', 'grid-cols-3']));
  });

  it('lights the chip of the preset in use, and none for days picked by hand', () => {
    atWidth(true);
    openPanel('this-month');

    const chip = screen.getByRole('button', { name: 'Mes en curso' });
    expect(chip.getAttribute('aria-pressed')).toBe('true');
    expect(chip.className).toContain('bg-primary/15');
    expect(chip.className).toContain('mobile:border-primary/40');

    cleanup();
    openPanel('custom');
    const pressed = screen
      .getAllByRole('button')
      .filter((b) => b.getAttribute('aria-pressed') === 'true' && b.closest('ul'));
    expect(pressed).toHaveLength(0);
  });

  it('gives the range its own line, and stacks «Cancelar» and «Aplicar» as a sheet foot', () => {
    atWidth(true);
    openPanel();

    const cancel = screen.getByRole('button', { name: 'Cancelar' });
    const apply = screen.getByRole('button', { name: 'Aplicar' });
    expect(cancel.parentElement).toBe(apply.parentElement);
    expect(cancel.className).toContain('border-input');
    const foot = cancel.parentElement!.parentElement!;
    expect(foot.firstElementChild?.textContent).toMatch(/octubre de 2026/);
    expect(foot.className).toContain('sticky');
  });

  it('keeps the desktop footer in one row', () => {
    atWidth(false);
    openPanel();

    const cancel = screen.getByRole('button', { name: 'Cancelar' });
    expect(cancel.className).not.toContain('border-input');
  });
});
