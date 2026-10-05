// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MovableTile, TileRemove, tileClass } from './tile';

afterEach(cleanup);

describe('tileClass', () => {
  it('shakes while arranging, and lifts the one in the hand', () => {
    expect(tileClass(false, false)).not.toContain('baldosa-tiembla');
    expect(tileClass(true, false)).toContain('baldosa-tiembla');
    expect(tileClass(true, true)).not.toContain('baldosa-tiembla');
    expect(tileClass(true, true)).toContain('--sombra-flotante');
  });
});

describe('MovableTile', () => {
  it('passes the pointer through and is named for moving', () => {
    const onBajar = vi.fn();
    const onMover = vi.fn();
    const onSoltar = vi.fn();
    render(
      <MovableTile
        arrastrada={false}
        etiqueta="Cuentas"
        estilo={{ transform: 'translate(4px, 0px)' }}
        onBajar={onBajar}
        onMover={onMover}
        onSoltar={onSoltar}
      >
        Cuentas
      </MovableTile>,
    );

    const baldosa = screen.getByRole('button', { name: 'Mover Cuentas' });
    expect(baldosa.style.transform).toBe('translate(4px, 0px)');
    fireEvent.pointerDown(baldosa);
    fireEvent.pointerMove(baldosa);
    fireEvent.pointerUp(baldosa);
    fireEvent.pointerCancel(baldosa);
    expect(onBajar).toHaveBeenCalledOnce();
    expect(onMover).toHaveBeenCalledOnce();
    expect(onSoltar).toHaveBeenCalledTimes(2);
  });
});

describe('TileRemove', () => {
  it('removes the tile it names', () => {
    const onQuitar = vi.fn();
    render(<TileRemove etiqueta="Cuentas" onQuitar={onQuitar} />);

    fireEvent.click(screen.getByRole('button', { name: 'Quitar Cuentas' }));
    expect(onQuitar).toHaveBeenCalledOnce();
  });
});
