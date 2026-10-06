// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BackCrumb, DrillButton } from './level-nav';

afterEach(cleanup);

describe('BackCrumb', () => {
  it.each([false, true])('reads the levels walked and goes back (fuerte %s)', (isStrong) => {
    const onBack = vi.fn();
    render(<BackCrumb path={['Hogar', 'Mercado']} isStrong={isStrong} onBack={onBack} />);

    const button = screen.getByRole('button', { name: 'Hogar · Mercado' });
    expect(button.className.includes('font-semibold')).toBe(isStrong);
    fireEvent.click(button);
    expect(onBack).toHaveBeenCalledOnce();
  });
});

describe('DrillButton', () => {
  it('names what it goes into', () => {
    const onDrill = vi.fn();
    render(<DrillButton name="Hogar" onDrill={onDrill} />);

    fireEvent.click(screen.getByRole('button', { name: 'Ver lo que hay dentro de Hogar' }));
    expect(onDrill).toHaveBeenCalledOnce();
  });
});
