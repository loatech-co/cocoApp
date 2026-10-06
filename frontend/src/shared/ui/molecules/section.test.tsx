// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { BLOCK } from '@/shared/ui/atoms/block';

import { Seccion } from './section';

afterEach(cleanup);

describe('Seccion', () => {
  it('names the part with a heading above its content, inside a block', () => {
    const { container } = render(
      <Seccion titulo="Soporte">
        <p>contenido</p>
      </Seccion>,
    );

    expect(screen.getByRole('heading', { level: 3, name: 'Soporte' })).toBeTruthy();
    expect(screen.getByText('contenido').parentElement?.className).toContain(BLOCK);
    expect(container.querySelector('section')?.className).not.toContain('flex-1');
  });

  it('leaves the content loose without a box and takes the spare height when it grows', () => {
    const { container } = render(
      <Seccion titulo="Archivos" caja={false} crece>
        <p>contenido</p>
      </Seccion>,
    );

    expect(screen.getByText('contenido').parentElement?.tagName).toBe('SECTION');
    expect(container.querySelector('section')?.className).toContain('flex-1');
  });
});
