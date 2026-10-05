// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Casilla } from './casilla';

afterEach(cleanup);

describe('Casilla', () => {
  it('is a real checkbox that takes its accessible name from the caller', () => {
    render(<Casilla aria-label="Elegir fila" />);

    expect(screen.getByRole('checkbox', { name: 'Elegir fila' })).toBeTruthy();
  });

  it('toggles and reports the change', () => {
    const onChange = vi.fn();
    render(<Casilla aria-label="Elegir fila" onChange={onChange} />);

    const box = screen.getByRole<HTMLInputElement>('checkbox');
    fireEvent.click(box);

    expect(box.checked).toBe(true);
    expect(onChange).toHaveBeenCalledOnce();
  });

  it('passes the disabled state to the native control, which assistive tech reads', () => {
    render(<Casilla aria-label="Elegir fila" disabled />);

    expect(screen.getByRole<HTMLInputElement>('checkbox').disabled).toBe(true);
  });

  it('draws a dash instead of a check when it is indeterminate', () => {
    const { container, rerender } = render(<Casilla aria-label="Elegir todas" />);
    const check = container.querySelector('svg')?.outerHTML;

    rerender(<Casilla aria-label="Elegir todas" indeterminado />);

    expect(container.querySelector('svg')?.outerHTML).not.toBe(check);
    expect(container.querySelector('[aria-hidden="true"]')?.className).toContain('bg-primary');
  });

  it('paints focus only when the keyboard asks for it', () => {
    const { container } = render(<Casilla aria-label="Elegir fila" />);

    const drawn = container.querySelector('[aria-hidden="true"]')!.className;
    expect(drawn).toContain('peer-focus-visible:ring-2');
    expect(drawn).not.toMatch(/peer-focus:/);
  });
});
