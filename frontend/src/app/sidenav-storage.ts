/**
 * Whether the side bar is collapsed, as this browser remembers it.
 *
 * Until 7.2-r1 the key was `sidenav-plegada` with `si`/`no`. The first read
 * that finds it moves its value to `sidenav-collapsed` and deletes it, so each
 * browser migrates once and on its own. The legacy read goes in the 7.10
 * contract.
 */
const KEY = 'sidenav-collapsed';
const LEGACY_KEY = 'sidenav-plegada';

export function readSidenavCollapsed(): boolean {
  const legacy = localStorage.getItem(LEGACY_KEY);
  if (legacy !== null) {
    localStorage.removeItem(LEGACY_KEY);
    // The current key wins if both exist: it is the newer one.
    if (localStorage.getItem(KEY) === null) writeSidenavCollapsed(legacy === 'si');
  }
  return localStorage.getItem(KEY) === 'true';
}

export function writeSidenavCollapsed(isCollapsed: boolean): void {
  localStorage.setItem(KEY, isCollapsed ? 'true' : 'false');
}
