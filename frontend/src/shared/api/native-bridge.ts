import { enLaApp } from '@/shared/lib/puente-nativo';

import { recibirSesion, sesionCerrada } from './session';

/*
  Por qué esto no vive en `puente-nativo`.

  `session` usa el puente (`enLaApp`, `pedirSesion`, `avisar`) y el puente
  publica dos funciones de `session` para que la app las llame. Con las dos
  mitades en el mismo archivo, `session` y `puente-nativo` se importaban el
  uno al otro. Aquí se juntan las dos y ninguna conoce a la otra: el puente
  sigue siendo el único sitio que conoce `window.webkit`, y el armazón sigue
  sin saber nada de `session`.
*/

/**
 * Publica `window.__coco`, lo que la app llama hacia la web.
 *
 * SOLO en la app: en un navegador normal no se instala nada, para que la
 * página no exponga una forma de navegar o de inyectar una sesión a quien no
 * es la app. Devuelve cómo quitarlo, para que el `useEffect` que lo registra
 * lo deje limpio al desmontarse (y `StrictMode` no deje dos copias).
 */
export function registrarPuente(acciones: {
  ir: (ruta: string) => void;
  abrirBusqueda: () => void;
}): () => void {
  // Fuera de la app no hay nada que quitar.
  if (!enLaApp()) return () => undefined;

  window.__coco = {
    ir: acciones.ir,
    abrirBusqueda: acciones.abrirBusqueda,
    recibirSesion,
    sesionCerrada,
  };

  return () => {
    delete window.__coco;
  };
}
