/**
 * Reload once when a deploy leaves the open tab's chunks behind.
 *
 * Every screen but the first is its own chunk with a hash in its name. After a
 * deploy, a tab that was already open still asks for the OLD names, the server
 * no longer has them, and Vite fires `vite:preloadError`. Reloading picks up
 * the new `index.html` and, with it, the new names.
 *
 * ── The guard ────────────────────────────────────────────────────────────────
 * If the chunk is missing for some other reason —the server is half deployed,
 * the network is down— reloading does not fix it, and an unguarded handler
 * would reload forever. So the time of the last reload goes to
 * `sessionStorage`, which survives the reload, and a second failure within
 * `WINDOW_MS` is left alone: it reaches the router and its error screen,
 * which offers the reload as a button instead.
 *
 * Without `sessionStorage` (blocked, private mode) there is no way to tell the
 * second failure from the first, so it does not reload at all.
 */
const STORAGE_KEY = 'coco:recarga-por-version';
const WINDOW_MS = 60_000;

interface Environment {
  win?: Window;
  reload?: () => void;
  now?: () => number;
}

export function installVersionReload({
  win = window,
  reload = () => win.location.reload(),
  now = Date.now,
}: Environment = {}): () => void {
  const onFail = (event: Event) => {
    try {
      const last = Number(win.sessionStorage.getItem(STORAGE_KEY));
      if (last && now() - last < WINDOW_MS) return;
      win.sessionStorage.setItem(STORAGE_KEY, String(now()));
    } catch {
      return;
    }
    // Vite throws the error after the event unless it is cancelled; the page
    // is about to be replaced, so there is nothing to throw it at.
    event.preventDefault();
    reload();
  };

  win.addEventListener('vite:preloadError', onFail);
  return () => win.removeEventListener('vite:preloadError', onFail);
}
