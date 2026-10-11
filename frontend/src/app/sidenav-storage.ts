/**
 * Whether the side bar is collapsed, as this browser remembers it.
 *
 * Until 7.2-r1 the key was `sidenav-plegada` with `si`/`no`. The first read
 * that finds it moves its value to `sidenav-collapsed` and deletes it, so each
 * browser migrates once and on its own. The legacy read goes in the 7.10
 * contract.
 *
 * `localStorage` may be unavailable: a browser with storage blocked, or a
 * private window where every access throws. The bar is a preference, so a
 * failure means «expanded» and nothing else; it ran as the initializer of a
 * `useState` and a `SecurityError` there was a blank screen (round 4, W3).
 */
const KEY = 'sidenav-collapsed';
const LEGACY_KEY = 'sidenav-plegada';

export function readSidenavCollapsed(): boolean {
  try {
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy !== null) {
      localStorage.removeItem(LEGACY_KEY);
      // The current key wins if both exist: it is the newer one.
      if (localStorage.getItem(KEY) === null) writeSidenavCollapsed(legacy === 'si');
    }
    return localStorage.getItem(KEY) === 'true';
  } catch {
    return false;
  }
}

export function writeSidenavCollapsed(isCollapsed: boolean): void {
  try {
    localStorage.setItem(KEY, isCollapsed ? 'true' : 'false');
  } catch {
    // Storage blocked: the preference lasts this visit and no longer.
  }
}
