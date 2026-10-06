// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RailToggle } from './rail-toggle';

afterEach(cleanup);

describe('RailToggle', () => {
  it.each([
    [true, 'Desplegar la barra lateral', 'w-full'],
    [false, 'Plegar la barra lateral', '-mr-2.25'],
  ])('folded %s: «%s»', (isCollapsed, name, className) => {
    const onToggle = vi.fn();
    render(<RailToggle isCollapsed={isCollapsed} onToggle={onToggle} />);

    const button = screen.getByRole('button', { name });
    expect(button.className).toContain(className);
    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledOnce();
  });
});
