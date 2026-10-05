// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AddSurface } from './add-surface';

afterEach(cleanup);

describe('AddSurface', () => {
  it.each([
    ['hueco', 'min-h-64', 'size-5'],
    ['barra', 'border-2', 'size-5'],
    ['fila', 'min-h-[42px]', 'size-4'],
  ] as const)('draws the %s form with its plus', (forma, clase, icono) => {
    const onClick = vi.fn();
    render(
      <AddSurface forma={forma} onClick={onClick}>
        Agregar
      </AddSurface>,
    );

    const boton = screen.getByRole('button', { name: 'Agregar' });
    expect(boton.className).toContain(clase);
    expect(boton.querySelector('svg')?.getAttribute('class')).toContain(icono);
    fireEvent.click(boton);
    expect(onClick).toHaveBeenCalledOnce();
  });
});
