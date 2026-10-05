// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { BLOQUE, Bloque } from './bloque';

afterEach(cleanup);

describe('Bloque', () => {
  it('is a div with the block surface, its own classes and its props', () => {
    render(
      <Bloque className="gap-3" role="group" aria-label="Detalle">
        dentro
      </Bloque>,
    );

    const bloque = screen.getByRole('group', { name: 'Detalle' });
    expect(bloque.tagName).toBe('DIV');
    expect(bloque.className).toContain(BLOQUE);
    expect(bloque.className).toContain('gap-3');
    expect(bloque.textContent).toBe('dentro');
  });
});
