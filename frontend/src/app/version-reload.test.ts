// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { installVersionReload } from './version-reload';

function failAChunk(): Event {
  const event = new Event('vite:preloadError', { cancelable: true });
  window.dispatchEvent(event);
  return event;
}

describe('reloading when a deploy leaves the chunks behind', () => {
  let desinstalar = () => {};
  afterEach(() => {
    desinstalar();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('reloads once and swallows the error', () => {
    const reload = vi.fn();
    desinstalar = installVersionReload({ reload, now: () => 1_000_000 });

    const event = failAChunk();

    expect(reload).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
  });

  it('does not loop: a second failure right after the reload is left to the error screen', () => {
    let clock = 1_000_000;
    const reload = vi.fn();
    desinstalar = installVersionReload({ reload, now: () => clock });

    failAChunk();
    clock += 5_000;
    const second = failAChunk();

    expect(reload).toHaveBeenCalledOnce();
    expect(second.defaultPrevented).toBe(false);
  });

  it('reloads again for a later deploy, once the window has passed', () => {
    let clock = 1_000_000;
    const reload = vi.fn();
    desinstalar = installVersionReload({ reload, now: () => clock });

    failAChunk();
    clock += 10 * 60_000;
    failAChunk();

    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('does not reload without sessionStorage, because it could not stop a loop', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    const reload = vi.fn();
    desinstalar = installVersionReload({ reload });

    const event = failAChunk();

    expect(reload).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });
});
