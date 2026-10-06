// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { BLOCK, Block } from './block';

afterEach(cleanup);

describe('Block', () => {
  it('is a div with the block surface, its own classes and its props', () => {
    render(
      <Block className="gap-3" role="group" aria-label="Detalle">
        dentro
      </Block>,
    );

    const block = screen.getByRole('group', { name: 'Detalle' });
    expect(block.tagName).toBe('DIV');
    expect(block.className).toContain(BLOCK);
    expect(block.className).toContain('gap-3');
    expect(block.textContent).toBe('dentro');
  });
});
