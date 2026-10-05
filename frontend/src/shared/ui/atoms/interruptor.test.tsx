// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Interruptor } from './interruptor';

afterEach(cleanup);

describe('Interruptor', () => {
  it('is announced as a switch with the name the caller gives it', () => {
    render(<Interruptor aria-label="Pago automático" />);

    expect(screen.getByRole('switch', { name: 'Pago automático' })).toBeTruthy();
  });

  it('turns on and off and reports each change', () => {
    const onChange = vi.fn();
    render(<Interruptor aria-label="Pago automático" onChange={onChange} />);

    const control = screen.getByRole<HTMLInputElement>('switch');
    fireEvent.click(control);
    expect(control.checked).toBe(true);
    fireEvent.click(control);
    expect(control.checked).toBe(false);

    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('passes the checked and disabled states to the native control', () => {
    render(<Interruptor aria-label="Pago automático" disabled defaultChecked />);

    const control = screen.getByRole<HTMLInputElement>('switch');
    expect(control.disabled).toBe(true);
    expect(control.checked).toBe(true);
  });

  it('paints focus only when the keyboard asks for it', () => {
    const { container } = render(<Interruptor aria-label="Pago automático" />);

    const track = container.querySelector('[aria-hidden="true"]')!.className;
    expect(track).toContain('peer-focus-visible:ring-2');
    expect(track).not.toMatch(/peer-focus:/);
  });

  it('spins and cannot be pressed again while it saves', () => {
    render(<Interruptor aria-label="Ajuste" cargando defaultChecked />);

    const interruptor = screen.getByRole('switch', { name: 'Ajuste' });
    expect(interruptor).toHaveProperty('disabled', true);
    expect(interruptor.parentElement!.querySelector('.animate-spin')).not.toBeNull();
  });

  it('lets an explicit disabled win over the saving state', () => {
    render(<Interruptor aria-label="Ajuste" cargando disabled={false} />);

    expect(screen.getByRole('switch', { name: 'Ajuste' })).toHaveProperty('disabled', false);
  });
});
