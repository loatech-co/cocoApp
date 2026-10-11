// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readSidenavCollapsed, writeSidenavCollapsed } from './sidenav-storage';

beforeEach(() => localStorage.clear());

describe('sidenav storage', () => {
  it('is expanded when nothing is stored', () => {
    expect(readSidenavCollapsed()).toBe(false);
  });

  it('writes and reads the English key', () => {
    writeSidenavCollapsed(true);

    expect(localStorage.getItem('sidenav-collapsed')).toBe('true');
    expect(readSidenavCollapsed()).toBe(true);

    writeSidenavCollapsed(false);
    expect(readSidenavCollapsed()).toBe(false);
  });

  it.each([
    ['si', true, 'true'],
    ['no', false, 'false'],
  ])('migrates the legacy value %s once and deletes the old key', (legacy, isCollapsed, stored) => {
    localStorage.setItem('sidenav-plegada', legacy);

    expect(readSidenavCollapsed()).toBe(isCollapsed);
    expect(localStorage.getItem('sidenav-plegada')).toBeNull();
    expect(localStorage.getItem('sidenav-collapsed')).toBe(stored);
  });

  it('keeps the English key when both exist', () => {
    localStorage.setItem('sidenav-plegada', 'si');
    localStorage.setItem('sidenav-collapsed', 'false');

    expect(readSidenavCollapsed()).toBe(false);
    expect(localStorage.getItem('sidenav-plegada')).toBeNull();
  });
});

describe('sidenav storage when the browser blocks it', () => {
  const blocked = new DOMException('The operation is insecure.', 'SecurityError');

  beforeEach(() => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw blocked;
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw blocked;
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it('reads as expanded instead of throwing', () => {
    expect(readSidenavCollapsed()).toBe(false);
  });

  it('writes without throwing', () => {
    expect(() => writeSidenavCollapsed(true)).not.toThrow();
  });
});
