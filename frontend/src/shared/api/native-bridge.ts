import { isInNativeApp } from '@/shared/lib/bridge';

import { refocus } from './query-client';
import { receiveSession, sessionClosed } from './session';

/*
  Why this does not live in `bridge`.

  `session` uses the bridge (`isInNativeApp`, `requestSession`, `notifyApp`)
  and the bridge publishes two functions of `session` for the app to call.
  With both halves in the same file, `session` and the bridge imported each
  other. Here the two meet and neither knows the other: the bridge is still
  the only place that knows `window.webkit`, and the shell still knows nothing
  about `session`.
*/

/**
 * Publishes `window.__coco`, what the app calls on the web.
 *
 * ONLY in the app: in a normal browser nothing is installed, so the page does
 * not expose a way to navigate or to inject a session to anyone who is not
 * the app. Returns how to remove it, so the `useEffect` that registers it
 * leaves it clean on unmount (and `StrictMode` does not leave two copies).
 */
export function registerBridge(actions: {
  ir: (path: string) => void;
  abrirBusqueda: () => void;
  /** A capture synced in the app: refetch what a new movement changes. */
  capturado: () => void;
}): () => void {
  // Outside the app there is nothing to remove.
  if (!isInNativeApp()) return () => undefined;

  window.__coco = {
    ir: actions.ir,
    abrirBusqueda: actions.abrirBusqueda,
    capturado: actions.capturado,
    primerPlano: refocus,
    recibirSesion: receiveSession,
    sesionCerrada: sessionClosed,
  };

  return () => {
    delete window.__coco;
  };
}
