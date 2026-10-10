// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MovableTile, TileRemove, tileClass } from './tile';

afterEach(cleanup);

describe('tileClass', () => {
  it('shakes while arranging, and lifts the one in the hand', () => {
    expect(tileClass(false, false)).not.toContain('tile-wiggle');
    expect(tileClass(true, false)).toContain('tile-wiggle');
    expect(tileClass(true, true)).not.toContain('tile-wiggle');
    expect(tileClass(true, true)).toContain('--floating-shadow');
  });
});

describe('MovableTile', () => {
  it('passes the pointer through and is named for moving', () => {
    const onGrab = vi.fn();
    const onMove = vi.fn();
    const onRelease = vi.fn();
    render(
      <MovableTile
        isDragging={false}
        label="Cuentas"
        style={{ transform: 'translate(4px, 0px)' }}
        onGrab={onGrab}
        onMove={onMove}
        onRelease={onRelease}
      >
        Cuentas
      </MovableTile>,
    );

    const tile = screen.getByRole('button', { name: 'Mover Cuentas' });
    expect(tile.style.transform).toBe('translate(4px, 0px)');
    fireEvent.pointerDown(tile);
    fireEvent.pointerMove(tile);
    fireEvent.pointerUp(tile);
    fireEvent.pointerCancel(tile);
    expect(onGrab).toHaveBeenCalledOnce();
    expect(onMove).toHaveBeenCalledOnce();
    expect(onRelease).toHaveBeenCalledTimes(2);
  });
});

describe('TileRemove', () => {
  it('removes the tile it names', () => {
    const onRemove = vi.fn();
    render(<TileRemove label="Cuentas" onRemove={onRemove} />);

    fireEvent.click(screen.getByRole('button', { name: 'Quitar Cuentas' }));
    expect(onRemove).toHaveBeenCalledOnce();
  });
});
