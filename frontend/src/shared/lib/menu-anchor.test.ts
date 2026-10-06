import { describe, expect, it } from 'vitest';

import { panelStyle, type Anclaje } from './menu-anchor';

const ANCLAJE: Anclaje = { top: 400, left: 16, derecha: 24, ancho: 300 };

describe('panelStyle', () => {
  it('caps the height at what is left below the trigger, whatever the width', () => {
    const tope = 'calc(100dvh - 416px)';

    expect(panelStyle(ANCLAJE, false, 'izquierda').maxHeight).toBe(tope);
    expect(panelStyle(ANCLAJE, true, 'izquierda').maxHeight).toBe(tope);
    expect(panelStyle(ANCLAJE, true, 'derecha').maxHeight).toBe(tope);
  });

  it('hangs 8px under the trigger, with its width or anchored by the side asked', () => {
    expect(panelStyle(ANCLAJE, false, 'izquierda')).toMatchObject({
      top: '408px',
      left: '16px',
      width: '300px',
    });
    expect(panelStyle(ANCLAJE, true, 'derecha')).toMatchObject({ top: '408px', right: '24px' });
  });
});
