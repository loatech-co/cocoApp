// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { IconGrid } from './icon-grid';

afterEach(cleanup);

const ICONS = [
  { name: 'house', label: 'Vivienda' },
  { name: 'zap', label: 'Energía' },
];

describe('IconGrid', () => {
  it('chooses an icon, and pressing the chosen one clears it', () => {
    const onSelect = vi.fn();
    render(<IconGrid icons={ICONS} value="house" onSelect={onSelect} />);

    const pressed = screen.getByRole('button', { name: 'Vivienda' });
    expect(pressed.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(pressed);
    expect(onSelect).toHaveBeenLastCalledWith(null);

    fireEvent.click(screen.getByRole('button', { name: 'Energía' }));
    expect(onSelect).toHaveBeenLastCalledWith('zap');
  });

  it('says so when nothing matches', () => {
    render(<IconGrid icons={[]} value={null} onSelect={() => undefined} />);

    expect(screen.getByText('Ningún icono se llama así.')).toBeTruthy();
  });
});
