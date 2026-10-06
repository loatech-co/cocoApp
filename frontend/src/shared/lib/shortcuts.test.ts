import { afterEach, describe, expect, it } from 'vitest';

import {
  MAX_SHORTCUTS,
  addShortcut,
  readShortcuts,
  moveShortcut,
  forgetShortcuts,
  removeShortcut,
  seedShortcuts,
} from './shortcuts';

/**
 * This screen was dead for two days because the store was a pair of empty
 * functions: every write fell into a hole and every redraw came back with the
 * factory set, so adding, removing and reordering looked like three broken
 * buttons and none of them was.
 *
 * That is why what is checked here is the boring part: that what was written
 * can be READ BACK.
 */
afterEach(forgetShortcuts);

describe('The shortcut store', () => {
  it('is seeded only once', () => {
    seedShortcuts(['/', '/centros-de-costos']);
    seedShortcuts(['/otra-cosa']);
    expect(readShortcuts()).toEqual(['/', '/centros-de-costos']);
  });

  it('what is added reads back', () => {
    seedShortcuts(['/']);
    expect(addShortcut('/cuentas')).toBe(true);
    expect(readShortcuts()).toEqual(['/', '/cuentas']);
  });

  it('what is removed is gone', () => {
    seedShortcuts(['/', '/cuentas']);
    removeShortcut('/cuentas');
    expect(readShortcuts()).toEqual(['/']);
  });

  it('reordering moves, it does not swap', () => {
    seedShortcuts(['/a', '/b', '/c']);
    moveShortcut(0, 2);
    expect(readShortcuts()).toEqual(['/b', '/c', '/a']);
  });

  it('the tenth does not get in, and that is known', () => {
    seedShortcuts(Array.from({ length: MAX_SHORTCUTS }, (_, i) => `/p${i}`));
    expect(addShortcut('/uno-mas')).toBe(false);
    expect(readShortcuts()).toHaveLength(MAX_SHORTCUTS);
  });

  it('seeding too many is trimmed to the maximum', () => {
    seedShortcuts(Array.from({ length: 20 }, (_, i) => `/p${i}`));
    expect(readShortcuts()).toHaveLength(MAX_SHORTCUTS);
  });

  it('adding the same path twice does not duplicate it', () => {
    seedShortcuts(['/']);
    addShortcut('/cuentas');
    addShortcut('/cuentas');
    expect(readShortcuts()).toEqual(['/', '/cuentas']);
  });

  it('an index that does not exist does not break the order', () => {
    seedShortcuts(['/a', '/b']);
    moveShortcut(0, 9);
    expect(readShortcuts()).toEqual(['/a', '/b']);
  });
});
