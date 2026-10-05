// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BackCrumb, DrillButton } from './level-nav';

afterEach(cleanup);

describe('BackCrumb', () => {
  it.each([false, true])('reads the levels walked and goes back (fuerte %s)', (fuerte) => {
    const onVolver = vi.fn();
    render(<BackCrumb ruta={['Hogar', 'Mercado']} fuerte={fuerte} onVolver={onVolver} />);

    const boton = screen.getByRole('button', { name: 'Hogar · Mercado' });
    expect(boton.className.includes('font-semibold')).toBe(fuerte);
    fireEvent.click(boton);
    expect(onVolver).toHaveBeenCalledOnce();
  });
});

describe('DrillButton', () => {
  it('names what it goes into', () => {
    const onEntrar = vi.fn();
    render(<DrillButton nombre="Hogar" onEntrar={onEntrar} />);

    fireEvent.click(screen.getByRole('button', { name: 'Ver lo que hay dentro de Hogar' }));
    expect(onEntrar).toHaveBeenCalledOnce();
  });
});
