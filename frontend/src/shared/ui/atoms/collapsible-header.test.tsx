// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CollapsibleHeader } from './collapsible-header';

afterEach(cleanup);

describe('CollapsibleHeader', () => {
  it.each([true, false])('says whether it is open (%s) and toggles', (isOpen) => {
    const onToggle = vi.fn();
    render(
      <CollapsibleHeader isOpen={isOpen} onToggle={onToggle}>
        Hogar
      </CollapsibleHeader>,
    );

    const header = screen.getByRole('button', { name: 'Hogar' });
    expect(header.getAttribute('aria-expanded')).toBe(String(isOpen));
    fireEvent.click(header);
    expect(onToggle).toHaveBeenCalledOnce();
  });
});
