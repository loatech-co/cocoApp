// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { BLOCK } from '@/shared/ui/atoms/block';

import { Section } from './section';

afterEach(cleanup);

describe('Seccion', () => {
  it('names the part with a heading above its content, inside a block', () => {
    const { container } = render(
      <Section title="Soporte">
        <p>contenido</p>
      </Section>,
    );

    expect(screen.getByRole('heading', { level: 3, name: 'Soporte' })).toBeTruthy();
    expect(screen.getByText('contenido').parentElement?.className).toContain(BLOCK);
    expect(container.querySelector('section')?.className).not.toContain('flex-1');
  });

  it('leaves the content loose without a box and takes the spare height when it grows', () => {
    const { container } = render(
      <Section title="Archivos" isBoxed={false} shouldGrow>
        <p>contenido</p>
      </Section>,
    );

    expect(screen.getByText('contenido').parentElement?.tagName).toBe('SECTION');
    expect(container.querySelector('section')?.className).toContain('flex-1');
  });
});
