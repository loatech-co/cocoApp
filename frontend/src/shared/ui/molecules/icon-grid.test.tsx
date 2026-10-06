// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { IconGrid } from './icon-grid';

afterEach(cleanup);

const ICONOS = [
  { name: 'house', label: 'Vivienda' },
  { name: 'zap', label: 'Energía' },
];

describe('IconGrid', () => {
  it('chooses an icon, and pressing the chosen one clears it', () => {
    const onElegir = vi.fn();
    render(<IconGrid filtrados={ICONOS} valor="house" onElegir={onElegir} />);

    const puesto = screen.getByRole('button', { name: 'Vivienda' });
    expect(puesto.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(puesto);
    expect(onElegir).toHaveBeenLastCalledWith(null);

    fireEvent.click(screen.getByRole('button', { name: 'Energía' }));
    expect(onElegir).toHaveBeenLastCalledWith('zap');
  });

  it('says so when nothing matches', () => {
    render(<IconGrid filtrados={[]} valor={null} onElegir={() => undefined} />);

    expect(screen.getByText('Ningún icono se llama así.')).toBeTruthy();
  });
});
