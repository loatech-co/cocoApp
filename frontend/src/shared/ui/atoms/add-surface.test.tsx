// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AddSurface } from './add-surface';

afterEach(cleanup);

describe('AddSurface', () => {
  it.each([
    ['slot', 'min-h-64', 'size-5'],
    ['bar', 'border-2', 'size-5'],
    ['row', 'min-h-[42px]', 'size-4'],
  ] as const)('draws the %s form with its plus', (shape, className, icon) => {
    const onClick = vi.fn();
    render(
      <AddSurface shape={shape} onClick={onClick}>
        Agregar
      </AddSurface>,
    );

    const button = screen.getByRole('button', { name: 'Agregar' });
    expect(button.className).toContain(className);
    expect(button.querySelector('svg')?.getAttribute('class')).toContain(icon);
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });
});
