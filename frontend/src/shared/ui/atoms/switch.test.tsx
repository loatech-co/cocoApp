// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Switch } from './switch';

afterEach(cleanup);

describe('Interruptor', () => {
  it('is announced as a switch with the name the caller gives it', () => {
    render(<Switch aria-label="Pago automático" />);

    expect(screen.getByRole('switch', { name: 'Pago automático' })).toBeTruthy();
  });

  it('turns on and off and reports each change', () => {
    const onChange = vi.fn();
    render(<Switch aria-label="Pago automático" onChange={onChange} />);

    const control = screen.getByRole<HTMLInputElement>('switch');
    fireEvent.click(control);
    expect(control.checked).toBe(true);
    fireEvent.click(control);
    expect(control.checked).toBe(false);

    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('passes the checked and disabled states to the native control', () => {
    render(<Switch aria-label="Pago automático" disabled defaultChecked />);

    const control = screen.getByRole<HTMLInputElement>('switch');
    expect(control.disabled).toBe(true);
    expect(control.checked).toBe(true);
  });

  it('paints focus only when the keyboard asks for it', () => {
    const { container } = render(<Switch aria-label="Pago automático" />);

    const track = container.querySelector('[aria-hidden="true"]')!.className;
    expect(track).toContain('peer-focus-visible:ring-2');
    expect(track).not.toMatch(/peer-focus:/);
  });

  it('spins and cannot be pressed again while it saves', () => {
    render(<Switch aria-label="Ajuste" isLoading defaultChecked />);

    const toggle = screen.getByRole('switch', { name: 'Ajuste' });
    expect(toggle).toHaveProperty('disabled', true);
    expect(toggle.parentElement!.querySelector('.animate-spin')).not.toBeNull();
  });

  it('lets an explicit disabled win over the saving state', () => {
    render(<Switch aria-label="Ajuste" isLoading disabled={false} />);

    expect(screen.getByRole('switch', { name: 'Ajuste' })).toHaveProperty('disabled', false);
  });
});
