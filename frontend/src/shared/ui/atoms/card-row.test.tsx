// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CardRow } from './card-row';

afterEach(cleanup);

describe('CardRow', () => {
  it('answers the pointer when it can be pressed', () => {
    const onClick = vi.fn();
    render(<CardRow onClick={onClick}>Arriendo</CardRow>);

    const fila = screen.getByRole('button', { name: 'Arriendo' });
    expect(fila).not.toHaveProperty('disabled', true);
    expect(fila.className).toContain('cursor-pointer');
    fireEvent.click(fila);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('stays still without an action', () => {
    render(<CardRow>Internet</CardRow>);

    const fila = screen.getByRole('button', { name: 'Internet' });
    expect(fila).toHaveProperty('disabled', true);
    expect(fila.className).toContain('cursor-default');
  });
});
