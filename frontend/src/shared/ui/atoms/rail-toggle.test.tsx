// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RailToggle } from './rail-toggle';

afterEach(cleanup);

describe('RailToggle', () => {
  it.each([
    [true, 'Desplegar la barra lateral', 'w-full'],
    [false, 'Plegar la barra lateral', '-mr-2.25'],
  ])('folded %s: «%s»', (plegada, nombre, clase) => {
    const onAlternar = vi.fn();
    render(<RailToggle plegada={plegada} onAlternar={onAlternar} />);

    const boton = screen.getByRole('button', { name: nombre });
    expect(boton.className).toContain(clase);
    fireEvent.click(boton);
    expect(onAlternar).toHaveBeenCalledOnce();
  });
});
