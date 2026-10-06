import { describe, expect, it } from 'vitest';

import { panelStyle, type Anchor } from './menu-anchor';

const ANCHOR: Anchor = { top: 400, left: 16, right: 24, width: 300 };

describe('panelStyle', () => {
  it('caps the height at what is left below the trigger, whatever the width', () => {
    const cap = 'calc(100dvh - 416px)';

    expect(panelStyle(ANCHOR, false, 'left').maxHeight).toBe(cap);
    expect(panelStyle(ANCHOR, true, 'left').maxHeight).toBe(cap);
    expect(panelStyle(ANCHOR, true, 'right').maxHeight).toBe(cap);
  });

  it('hangs 8px under the trigger, with its width or anchored by the side asked', () => {
    expect(panelStyle(ANCHOR, false, 'left')).toMatchObject({
      top: '408px',
      left: '16px',
      width: '300px',
    });
    expect(panelStyle(ANCHOR, true, 'right')).toMatchObject({ top: '408px', right: '24px' });
  });
});
