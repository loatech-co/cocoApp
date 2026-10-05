// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DropSurface } from './drop-surface';

afterEach(cleanup);

function caja(props: { forma: 'cuadro' | 'completa'; encima: boolean; ocupada: boolean }) {
  const onPulsar = vi.fn();
  render(
    <DropSurface {...props} etiqueta="Agregar soportes" onPulsar={onPulsar}>
      <span>rótulo</span>
    </DropSurface>,
  );
  const boton = screen.getByRole('button', { name: 'Agregar soportes' });
  return { boton, marco: boton.parentElement!, onPulsar };
}

describe('DropSurface', () => {
  it('opens the picker from anywhere in the box', () => {
    const { boton, marco, onPulsar } = caja({ forma: 'cuadro', encima: false, ocupada: false });

    expect(marco.className).toContain('size-[104px]');
    expect(marco.textContent).toBe('rótulo');
    fireEvent.click(boton);
    expect(onPulsar).toHaveBeenCalledOnce();
  });

  it('lights up while something is dragged over it', () => {
    const { marco } = caja({ forma: 'completa', encima: true, ocupada: false });

    expect(marco.className).toContain('min-h-36');
    expect(marco.className).toContain('border-acento-tinta');
  });

  it('cannot be pressed while it uploads', () => {
    const { boton, marco } = caja({ forma: 'cuadro', encima: true, ocupada: true });

    expect(boton).toHaveProperty('disabled', true);
    expect(marco.className).toContain('cursor-wait');
  });
});
