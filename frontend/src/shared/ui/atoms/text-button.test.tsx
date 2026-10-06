// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { TextButton } from './text-button';

afterEach(cleanup);

describe('TextButton', () => {
  it('gives the faint tone a 24px hit area (WCAG 2.5.8)', () => {
    render(
      <TextButton tone="subtle" onClick={() => undefined}>
        Elegir por centro y categoría
      </TextButton>,
    );

    const button = screen.getByRole('button', { name: 'Elegir por centro y categoría' });
    expect(button.className).toContain('min-h-6');
  });
});
