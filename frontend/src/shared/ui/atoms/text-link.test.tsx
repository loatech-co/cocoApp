// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';

import { TextLink } from './text-link';

afterEach(cleanup);

describe('TextLink', () => {
  it('is underlined at rest, not only on hover (WCAG 1.4.1)', () => {
    render(
      <MemoryRouter>
        <p>
          ¿No tienes cuenta? <TextLink to="/registro">Solicitar acceso</TextLink>
        </p>
      </MemoryRouter>,
    );

    const enlace = screen.getByRole('link', { name: 'Solicitar acceso' });
    expect(enlace.getAttribute('href')).toBe('/registro');
    expect(enlace.className.split(' ')).toContain('underline');
  });
});
