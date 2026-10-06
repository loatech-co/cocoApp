// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CardRow } from './card-row';

afterEach(cleanup);

describe('CardRow', () => {
  it('answers the pointer when it can be pressed', () => {
    const onClick = vi.fn();
    render(<CardRow onClick={onClick}>Arriendo</CardRow>);

    const row = screen.getByRole('button', { name: 'Arriendo' });
    expect(row).not.toHaveProperty('disabled', true);
    expect(row.className).toContain('cursor-pointer');
    fireEvent.click(row);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('stays still without an action', () => {
    render(<CardRow>Internet</CardRow>);

    const row = screen.getByRole('button', { name: 'Internet' });
    expect(row).toHaveProperty('disabled', true);
    expect(row.className).toContain('cursor-default');
  });
});
