// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { instalarRecargaPorVersion } from './recarga-por-version';

function fallarUnTrozo(): Event {
  const evento = new Event('vite:preloadError', { cancelable: true });
  window.dispatchEvent(evento);
  return evento;
}

describe('reloading when a deploy leaves the chunks behind', () => {
  let desinstalar = () => {};
  afterEach(() => {
    desinstalar();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('reloads once and swallows the error', () => {
    const recargar = vi.fn();
    desinstalar = instalarRecargaPorVersion({ recargar, ahora: () => 1_000_000 });

    const evento = fallarUnTrozo();

    expect(recargar).toHaveBeenCalledOnce();
    expect(evento.defaultPrevented).toBe(true);
  });

  it('does not loop: a second failure right after the reload is left to the error screen', () => {
    let reloj = 1_000_000;
    const recargar = vi.fn();
    desinstalar = instalarRecargaPorVersion({ recargar, ahora: () => reloj });

    fallarUnTrozo();
    reloj += 5_000;
    const segundo = fallarUnTrozo();

    expect(recargar).toHaveBeenCalledOnce();
    expect(segundo.defaultPrevented).toBe(false);
  });

  it('reloads again for a later deploy, once the window has passed', () => {
    let reloj = 1_000_000;
    const recargar = vi.fn();
    desinstalar = instalarRecargaPorVersion({ recargar, ahora: () => reloj });

    fallarUnTrozo();
    reloj += 10 * 60_000;
    fallarUnTrozo();

    expect(recargar).toHaveBeenCalledTimes(2);
  });

  it('does not reload without sessionStorage, because it could not stop a loop', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    const recargar = vi.fn();
    desinstalar = instalarRecargaPorVersion({ recargar });

    const evento = fallarUnTrozo();

    expect(recargar).not.toHaveBeenCalled();
    expect(evento.defaultPrevented).toBe(false);
  });
});
