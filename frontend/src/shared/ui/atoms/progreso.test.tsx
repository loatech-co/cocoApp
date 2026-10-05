// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Progreso } from './progreso';

afterEach(cleanup);

describe('Progreso', () => {
  it('is a named progress bar from 0 to 100', () => {
    render(<Progreso avance={0.42} etiqueta="Pagado este mes" />);

    const bar = screen.getByRole('progressbar', { name: 'Pagado este mes' });
    expect(bar.getAttribute('aria-valuemin')).toBe('0');
    expect(bar.getAttribute('aria-valuemax')).toBe('100');
    expect(bar.getAttribute('aria-valuenow')).toBe('42');
    expect((bar.firstElementChild as HTMLElement).style.width).toBe('42%');
  });

  it.each([
    [-0.5, '0'],
    [1.7, '100'],
  ])('clamps an advance of %s to the bar', (avance, esperado) => {
    render(<Progreso avance={avance} etiqueta="Avance" />);

    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe(esperado);
  });
});
