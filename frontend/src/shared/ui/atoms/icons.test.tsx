// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { CATEGORY_ICONS, CategoryIcon } from './icons';

afterEach(cleanup);

describe('IconoDeCategoria', () => {
  it('draws every icon offered to the user', () => {
    for (const { name } of CATEGORY_ICONS) {
      const { container, unmount } = render(<CategoryIcon name={name} />);
      expect(container.querySelector('svg'), name).not.toBeNull();
      unmount();
    }
  });

  it('offers each icon once, with a Spanish label', () => {
    const names = CATEGORY_ICONS.map((i) => i.name);

    expect(new Set(names).size).toBe(names.length);
    for (const { label } of CATEGORY_ICONS) expect(label.trim()).not.toBe('');
  });

  it('is decorative', () => {
    const { container } = render(<CategoryIcon name="wallet" className="size-5" />);

    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('class')).toContain('size-5');
  });

  it.each([null, '', 'not-an-icon'])('draws nothing for %s', (name) => {
    const { container } = render(<CategoryIcon name={name} />);

    expect(container.innerHTML).toBe('');
  });
});
