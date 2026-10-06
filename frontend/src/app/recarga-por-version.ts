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
 * `VENTANA_MS` is left alone: it reaches the router and its error screen,
 * which offers the reload as a button instead.
 *
 * Without `sessionStorage` (blocked, private mode) there is no way to tell the
 * second failure from the first, so it does not reload at all.
 */
const CLAVE = 'coco:recarga-por-version';
const VENTANA_MS = 60_000;

interface Entorno {
  ventana?: Window;
  recargar?: () => void;
  ahora?: () => number;
}

export function instalarRecargaPorVersion({
  ventana = window,
  recargar = () => ventana.location.reload(),
  ahora = Date.now,
}: Entorno = {}): () => void {
  const alFallar = (evento: Event) => {
    try {
      const ultima = Number(ventana.sessionStorage.getItem(CLAVE));
      if (ultima && ahora() - ultima < VENTANA_MS) return;
      ventana.sessionStorage.setItem(CLAVE, String(ahora()));
    } catch {
      return;
    }
    // Vite throws the error after the event unless it is cancelled; the page
    // is about to be replaced, so there is nothing to throw it at.
    evento.preventDefault();
    recargar();
  };

  ventana.addEventListener('vite:preloadError', alFallar);
  return () => ventana.removeEventListener('vite:preloadError', alFallar);
}
